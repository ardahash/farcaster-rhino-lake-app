// farcaster_reactions_with_wallets.js
import "dotenv/config";

const CAST_HASH = "0x6b438ccf2ddad23a1c3daa3f682b9a300c4d4d0a";
const NEYNAR_KEY = process.env.NEYNAR_API_KEY;

if (!NEYNAR_KEY) throw new Error("NEYNAR_API_KEY not found in .env");

async function getJson(url) {
  const r = await fetch(url, { headers: { "x-api-key": NEYNAR_KEY } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  return r.json();
}

async function getAllReactions({ targetFid, hash, reactionType }) {
  let pageToken = "";
  const fids = new Set();

  while (true) {
    const url = new URL("https://snapchain-api.neynar.com/v1/reactionsByCast");
    url.searchParams.set("target_fid", String(targetFid));
    url.searchParams.set("target_hash", hash);
    url.searchParams.set("reaction_type", reactionType); // Like | Recast
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const data = await getJson(url.toString());
    for (const msg of data.messages ?? []) {
      if (msg?.data?.fid) fids.add(msg.data.fid);
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return [...fids];
}

async function fetchUsersByFids(fids) {
  const users = [];
  for (let i = 0; i < fids.length; i += 100) {
    const batch = fids.slice(i, i + 100);
    const u = new URL("https://api.neynar.com/v2/farcaster/user/bulk");
    u.searchParams.set("fids", batch.join(","));

    const data = await getJson(u.toString());
    users.push(...(data.users ?? []));
  }
  return users;
}

function normalizeUser(u) {
  // Neynar user shape can vary slightly by endpoint/version.
  // These fields are commonly present.
  const fid = u.fid;
  const username = u.username ?? u?.user?.username;
  const displayName = u.display_name ?? u?.user?.display_name;

  // Wallets:
  // custody_address is the primary Farcaster custody address.
  const custody = u.custody_address ?? u?.user?.custody_address;

  // verified_addresses may include eth_addresses + sol_addresses.
  const verified = u.verified_addresses ?? u?.user?.verified_addresses ?? {};
  const ethVerified =
    verified.eth_addresses ??
    verified.ethereum ??
    verified.eth ??
    [];

  return {
    fid,
    username,
    displayName,
    custody_address: custody ?? null,
    verified_eth_addresses: Array.isArray(ethVerified) ? ethVerified : [],
  };
}

async function main() {
  // 1) lookup cast -> author fid
  const cast = await getJson(
    `https://api.neynar.com/v2/farcaster/cast?type=hash&identifier=${CAST_HASH}`
  );
  const authorFid = cast?.cast?.author?.fid;
  if (!authorFid) throw new Error("Could not resolve author fid from cast lookup");

  // 2) get reactions
  const likeFids = await getAllReactions({ targetFid: authorFid, hash: CAST_HASH, reactionType: "Like" });
  const recastFids = await getAllReactions({ targetFid: authorFid, hash: CAST_HASH, reactionType: "Recast" });

  // 3) union of fids -> fetch users
  const allFids = [...new Set([...likeFids, ...recastFids])];
  const usersRaw = await fetchUsersByFids(allFids);
  const users = usersRaw.map(normalizeUser);

  // 4) mark whether each user liked / recasted
  const likeSet = new Set(likeFids);
  const recastSet = new Set(recastFids);

  const enriched = users.map((u) => ({
    ...u,
    liked: likeSet.has(u.fid),
    recasted: recastSet.has(u.fid),
  }));

  console.log(JSON.stringify({
    cast_hash: CAST_HASH,
    author_fid: authorFid,
    totals: { likes: likeFids.length, recasts: recastFids.length, unique_accounts: allFids.length },
    users: enriched
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
