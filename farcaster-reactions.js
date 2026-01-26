// farcaster_reactions_to_csv.js
import "dotenv/config";
import { writeFile } from "node:fs/promises";

const CAST_INPUT = process.argv[2] || process.env.CAST_HASH;
const OUT_CSV = process.env.OUT_CSV || "reactions.csv";
const OUT_JSON = process.env.OUT_JSON || "reactions.json";
const NEYNAR_KEY = process.env.NEYNAR_API_KEY;

if (!NEYNAR_KEY) throw new Error("NEYNAR_API_KEY not found in .env");
if (!CAST_INPUT) {
  console.error("Usage: node farcaster-reactions.js <cast_hash_or_url>");
  console.error("Tip: set CAST_HASH in .env or pass it as the first argument.");
  process.exit(1);
}

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
  const fid = u.fid;
  const username = u.username ?? u?.user?.username ?? null;
  const displayName = u.display_name ?? u?.user?.display_name ?? null;
  const custody = u.custody_address ?? u?.user?.custody_address ?? null;

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
    custody_address: custody,
    verified_eth_addresses: Array.isArray(ethVerified) ? ethVerified : [],
  };
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s;
}

function randomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  const input = CAST_INPUT.trim();
  let castType = "hash";
  let castIdentifier = input;

  if (/^https?:\/\//i.test(input)) {
    castType = "url";
  } else {
    const isHex = /^0x[0-9a-fA-F]+$/.test(input);
    const isValidLen = input.length === 42 || input.length === 66;
    if (!isHex || !isValidLen) {
      console.error(
        "Cast hash looks invalid. Expected 0x + 40 or 64 hex chars (length 42 or 66), or pass a full cast URL."
      );
      process.exit(1);
    }
  }

  const cast = await getJson(
    `https://api.neynar.com/v2/farcaster/cast?type=${castType}&identifier=${encodeURIComponent(castIdentifier)}`
  );
  const authorFid = cast?.cast?.author?.fid;
  if (!authorFid) throw new Error("Could not resolve author fid from cast lookup");

  const likeFids = await getAllReactions({
    targetFid: authorFid,
    hash: castIdentifier,
    reactionType: "Like",
  });
  const recastFids = await getAllReactions({
    targetFid: authorFid,
    hash: castIdentifier,
    reactionType: "Recast",
  });

  const allFids = [...new Set([...likeFids, ...recastFids])];
  const usersRaw = await fetchUsersByFids(allFids);
  const users = usersRaw.map(normalizeUser);

  const likeSet = new Set(likeFids);
  const recastSet = new Set(recastFids);

  const enriched = users.map((u) => ({
    ...u,
    liked: likeSet.has(u.fid),
    recasted: recastSet.has(u.fid),
  }));

  const jsonPayload = {
    cast_hash: castIdentifier,
    author_fid: authorFid,
    lookup_type: castType,
    totals: {
      likes: likeFids.length,
      recasts: recastFids.length,
      unique_accounts: allFids.length,
    },
    users: enriched,
  };

  const header = ["custody_address", "random_number"];
  const rows = enriched.map((u) => [
    u.custody_address ?? "",
    randomIntInclusive(1000, 20000),
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  await Promise.all([
    writeFile(OUT_CSV, csv, "utf8"),
    writeFile(OUT_JSON, JSON.stringify(jsonPayload, null, 2), "utf8"),
  ]);

  console.log(
    JSON.stringify(
      {
        cast_hash: castIdentifier,
        author_fid: authorFid,
        lookup_type: castType,
        totals: jsonPayload.totals,
        output: { csv: OUT_CSV, json: OUT_JSON },
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
