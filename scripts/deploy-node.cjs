import "dotenv/config";
import { ethers } from "ethers";
import fs from "fs";

const RPC = "https://mainnet.base.org";
const ZEN_BASE = "0xf43eB8De897Fbc7F2502483B2Bef7Bb9EA179229";
const BAR_BASE = "0x1637b8c1Fba28E99776229DF6a7D9f5213E20b07";
const PROFILE_PIC_TREASURY = "0x0F6A41a801E6B6490Da4e8FcC4394c70809deB9e";

function loadArtifact(name) {
  // adjust path to your artifacts output
  const p = `./artifacts/contracts/${name}.sol/${name}.json`;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  return { abi: j.abi, bytecode: j.bytecode };
}

function e18(n) {
  return ethers.parseUnits(String(n), 18);
}

async function deployContract(wallet, artifact, args = []) {
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const c = await factory.deploy(...args);
  await c.waitForDeployment();
  return c;
}

async function main() {
  if (!process.env.BASE_PRIVATE_KEY) throw new Error("Missing BASE_PRIVATE_KEY in .env");
  if (!process.env.NEXT_PUBLIC_USDC_ADDRESS) throw new Error("Missing NEXT_PUBLIC_USDC_ADDRESS in .env");

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(process.env.BASE_PRIVATE_KEY, provider);

  const owner = wallet.address;

  console.log("Deployer:", owner);

  const RhinoToken = loadArtifact("RhinoToken");
  const CityNFT = loadArtifact("CityNFT");
  const RhinoLakeGame = loadArtifact("RhinoLakeGame");
  const ZenBurnToRhino = loadArtifact("ZenBurnToRhino");
  const ProfilePicNFT = loadArtifact("ProfilePicNFT");

  const rhino = await deployContract(wallet, RhinoToken, [owner]);
  console.log("RHINO:", await rhino.getAddress());

  const city = await deployContract(wallet, CityNFT, [owner]);
  console.log("CityNFT:", await city.getAddress());

  const game = await deployContract(wallet, RhinoLakeGame, [
    owner,
    BAR_BASE,
    await rhino.getAddress(),
    await city.getAddress(),
  ]);
  console.log("Game:", await game.getAddress());

  // Tier schedule (example)
  const tierCaps = [
    e18("2000000000"),
    e18("7000000000"),
    e18("15000000000"),
    e18("30000000000"),
    e18("50000000000"),
    e18("70000000000"),
    e18("85000000000"),
    e18("95000000000"),
    e18("100000000000"),
  ];

  const tierRates = [
    e18("1000000"),
    e18("300000"),
    e18("100000"),
    e18("30000"),
    e18("10000"),
    e18("3000"),
    e18("1000"),
    e18("300"),
    e18("100"),
  ];

  const burner = await deployContract(wallet, ZenBurnToRhino, [
    owner,
    ZEN_BASE,
    await rhino.getAddress(),
    tierCaps,
    tierRates,
  ]);
  console.log("Burner:", await burner.getAddress());

  const profilePic = await deployContract(wallet, ProfilePicNFT, [
    owner,
    process.env.NEXT_PUBLIC_USDC_ADDRESS,
    PROFILE_PIC_TREASURY,
  ]);
  console.log("ProfilePicNFT:", await profilePic.getAddress());

  // set minter for burner
  await (await rhino.setMinter(await burner.getAddress(), true)).wait();
  console.log("Set minter: burner ✅");

  // transfer CityNFT ownership to Game (so Game can mint cities)
  await (await city.transferOwnership(await game.getAddress())).wait();
  console.log("CityNFT owner -> Game ✅");

  // set attack params (optional)
  await (await game.setAttackParams(10 * 60, e18("10"))).wait();
  console.log("Attack params ✅");

  console.log("\nDONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
