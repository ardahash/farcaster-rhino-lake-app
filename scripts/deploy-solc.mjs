// scripts/deploy-solc.mjs
import "dotenv/config";
import fs from "fs";
import path from "path";
import solc from "solc";
import { ethers } from "ethers";

// -----------------------------
// Base mainnet constants
// -----------------------------
const RPC = "https://mainnet.base.org";
const CHAIN_ID = 8453;

const ZEN_BASE = "0xf43eB8De897Fbc7F2502483B2Bef7Bb9EA179229";
const BAR_BASE = "0x1637b8c1Fba28E99776229DF6a7D9f5213E20b07";
const PROFILE_PIC_TREASURY = "0x0F6A41a801E6B6490Da4e8FcC4394c70809deB9e";

// -----------------------------
// Paths / compile allowlist
// -----------------------------
const ROOT = process.cwd();
const CONTRACTS_DIR = path.join(ROOT, "contracts");

// ✅ Compile ONLY these files (prevents stray/old .sol files from breaking compilation)
const CONTRACT_FILES = [
  "RhinoToken.sol",
  "CityNFT.sol",
  "RhinoLakeGame.sol",
  "ZenBurnToRhino.sol",
  "ProfilePicNFT.sol",
];


// -----------------------------
// Helpers
// -----------------------------
function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name} in .env (project root).`);
  return v;
}

function e18(n) {
  return ethers.parseUnits(String(n), 18);
}

async function getFeeOverrides(provider) {
  const feeData = await provider.getFeeData();
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? ethers.parseUnits("0.1", "gwei");
  const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice ?? ethers.parseUnits("0.1", "gwei");
  return {
    maxPriorityFeePerGas: maxPriorityFeePerGas * 2n,
    maxFeePerGas: maxFeePerGas * 2n,
  };
}

// solc import resolver: supports /contracts and node_modules (OpenZeppelin)
function findImports(importPath) {
  // 1) contracts relative
  const p1 = path.join(CONTRACTS_DIR, importPath);
  if (fs.existsSync(p1)) return { contents: fs.readFileSync(p1, "utf8") };

  // 2) node_modules
  const p2 = path.join(ROOT, "node_modules", ...importPath.split("/"));
  if (fs.existsSync(p2)) return { contents: fs.readFileSync(p2, "utf8") };

  return { error: `Import not found: ${importPath}` };
}

function compileContracts() {
  if (!fs.existsSync(CONTRACTS_DIR)) {
    throw new Error(`Missing /contracts folder at ${CONTRACTS_DIR}`);
  }

  // Ensure required files exist
  for (const f of CONTRACT_FILES) {
    const full = path.join(CONTRACTS_DIR, f);
    if (!fs.existsSync(full)) throw new Error(`Missing required contract file: contracts/${f}`);
  }

  const sources = {};
  for (const f of CONTRACT_FILES) {
    const full = path.join(CONTRACTS_DIR, f);
    sources[f] = { content: fs.readFileSync(full, "utf8") };
  }

  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": { "*": ["abi", "evm.bytecode.object"] },
      },
    },
  };

  console.log("solc version:", solc.version());
  console.log("Compiling:", CONTRACT_FILES.join(", "));

  const raw = solc.compile(JSON.stringify(input), { import: findImports });
  const output = JSON.parse(raw);

  if (output.errors?.length) {
    for (const e of output.errors) console.log(e.formattedMessage);
    const fatal = output.errors.filter((e) => e.severity === "error");
    if (fatal.length) throw new Error("Solc compilation failed (see errors above).");
  }

  const compiled = {};
  for (const file of Object.keys(output.contracts || {})) {
    for (const name of Object.keys(output.contracts[file] || {})) {
      const c = output.contracts[file][name];
      const bytecode = c?.evm?.bytecode?.object;
      if (!bytecode || bytecode.length < 10) continue;
      compiled[name] = { abi: c.abi, bytecode: "0x" + bytecode };
    }
  }

  const required = ["RhinoToken", "CityNFT", "RhinoLakeGame", "ZenBurnToRhino", "ProfilePicNFT"];
  for (const r of required) {
    if (!compiled[r]) {
      console.log("Compiled contracts:", Object.keys(compiled));
      throw new Error(`Missing compiled contract ${r}. Check filenames & contract names.`);
    }
  }

  console.log("Compiled OK ✅");
  return compiled;
}

async function deploy(wallet, compiled, name, args = []) {
  const art = compiled[name];
  if (!art) throw new Error(`Artifact not found for ${name}`);

  const factory = new ethers.ContractFactory(art.abi, art.bytecode, wallet);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const resume = args.has("--resume");

  const pk = mustEnv("BASE_PRIVATE_KEY");
  const usdc = mustEnv("NEXT_PUBLIC_USDC_ADDRESS");
  const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID);
  const wallet = new ethers.Wallet(pk, provider);

  const owner = wallet.address;    // owner = deployer
  const treasury = wallet.address; // treasury = deployer

  console.log("Deployer/Owner/Treasury:", owner);

  const compiled = compileContracts();

  let rhinoAddr;
  let cityAddr;
  let gameAddr;
  let burnerAddr;
  let profilePicAddr;
  let rhino;
  let city;
  let game;

  if (resume) {
    rhinoAddr = mustEnv("RHINO_ADDR");
    cityAddr = mustEnv("CITY_ADDR");
    gameAddr = mustEnv("GAME_ADDR");
    burnerAddr = mustEnv("BURNER_ADDR");
    profilePicAddr = process.env.NEXT_PUBLIC_PROFILE_PIC_NFT_ADDRESS;
    rhino = new ethers.Contract(rhinoAddr, compiled.RhinoToken.abi, wallet);
    city = new ethers.Contract(cityAddr, compiled.CityNFT.abi, wallet);
    game = new ethers.Contract(gameAddr, compiled.RhinoLakeGame.abi, wallet);
    console.log("\nResume mode enabled.");
    console.log("RHINO:", rhinoAddr);
    console.log("CityNFT:", cityAddr);
    console.log("Game:", gameAddr);
    console.log("Burner:", burnerAddr);
    if (profilePicAddr) {
      console.log("ProfilePicNFT:", profilePicAddr);
    }
  } else {
    console.log("\nDeploying RhinoToken...");
    rhino = await deploy(wallet, compiled, "RhinoToken", [owner]);
    rhinoAddr = await rhino.getAddress();
    console.log("RHINO:", rhinoAddr);

    console.log("\nDeploying CityNFT...");
    city = await deploy(wallet, compiled, "CityNFT", [owner]);
    cityAddr = await city.getAddress();
    console.log("CityNFT:", cityAddr);

    console.log("\nDeploying RhinoLakeGame...");
    game = await deploy(wallet, compiled, "RhinoLakeGame", [owner, BAR_BASE, rhinoAddr, cityAddr]);
    gameAddr = await game.getAddress();
    console.log("Game:", gameAddr);
  }

  // Tier schedule (example; tune later)
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

  console.log("\nDeploying ZenBurnToRhino...");
  if (!burnerAddr) {
    const burner = await deploy(wallet, compiled, "ZenBurnToRhino", [owner, ZEN_BASE, rhinoAddr, tierCaps, tierRates]);
    burnerAddr = await burner.getAddress();
    console.log("Burner:", burnerAddr);
  }

  console.log("\nDeploying ProfilePicNFT...");
  if (!profilePicAddr) {
    const profilePic = await deploy(wallet, compiled, "ProfilePicNFT", [owner, usdc, PROFILE_PIC_TREASURY]);
    profilePicAddr = await profilePic.getAddress();
    console.log("ProfilePicNFT:", profilePicAddr);
  }

  console.log("\nSetting RHINO minter = burner...");
  const isMinter = await rhino.minters(burnerAddr);
  if (!isMinter) {
    const feeOverrides = await getFeeOverrides(provider);
    await (await rhino.setMinter(burnerAddr, true, feeOverrides)).wait();
    console.log("Minter set ✅");
  } else {
    console.log("Minter already set ✅");
  }

  console.log("\nTransferring CityNFT ownership to Game (so createCity works)...");
  const cityOwner = await city.owner();
  if (cityOwner.toLowerCase() !== gameAddr.toLowerCase()) {
    const feeOverrides = await getFeeOverrides(provider);
    await (await city.transferOwnership(gameAddr, feeOverrides)).wait();
    console.log("CityNFT owner -> Game ✅");
  } else {
    console.log("CityNFT owner already set ✅");
  }

  console.log("\nSetting attack params (10 min cooldown, 10 RHINO burn per attack)...");
  const feeOverrides = await getFeeOverrides(provider);
  await (await game.setAttackParams(10 * 60, e18("10"), feeOverrides)).wait();
  console.log("Attack params set ✅");

  console.log("\n==============================");
  console.log("✅ DEPLOY COMPLETE (Base Mainnet)");
  console.log("==============================");
  console.log("Owner/Treasury:", treasury);
  console.log("ZEN:", ZEN_BASE);
  console.log("BAR:", BAR_BASE);
  console.log("RHINO:", rhinoAddr);
  console.log("CityNFT:", cityAddr);
  console.log("Game:", gameAddr);
  console.log("Burner:", burnerAddr);
  console.log("ProfilePicNFT:", profilePicAddr);
}

main().catch((e) => {
  console.error("\nDEPLOY FAILED ❌");
  console.error(e);
  process.exit(1);
});
