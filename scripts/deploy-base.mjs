const hre = require("hardhat");

const ZEN_BASE = "0xf43eB8De897Fbc7F2502483B2Bef7Bb9EA179229";
const BAR_BASE = "0x1637b8c1Fba28E99776229DF6a7D9f5213E20b07";

function e18(n) {
  // n is a string/int that fits in JS safely? Use strings to be safe for big numbers.
  return hre.ethers.parseUnits(String(n), 18);
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const owner = deployer.address;
  const treasury = deployer.address;

  console.log("Deployer:", deployer.address);

  // 1) Deploy RHINO
  const RhinoToken = await hre.ethers.getContractFactory("RhinoToken");
  const rhino = await RhinoToken.deploy(owner);
  await rhino.waitForDeployment();
  console.log("RHINO:", await rhino.getAddress());

  // 2) Deploy CityNFT
  const CityNFT = await hre.ethers.getContractFactory("CityNFT");
  const city = await CityNFT.deploy(owner);
  await city.waitForDeployment();
  console.log("CityNFT:", await city.getAddress());

  // 3) Deploy Game
  const RhinoLakeGame = await hre.ethers.getContractFactory("RhinoLakeGame");
  const game = await RhinoLakeGame.deploy(
    owner,
    BAR_BASE,
    await rhino.getAddress(),
    await city.getAddress()
  );
  await game.waitForDeployment();
  console.log("Game:", await game.getAddress());

  // 4) Tier schedule for ZenBurnToRhino (example; tune later)
  // Caps (cumulative) in RHINO:
  // 2b, 7b, 15b, 30b, 50b, 70b, 85b, 95b, 100b
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

  // Rates (RHINO per 1 ZEN):
  // 1,000,000; 300,000; 100,000; 30,000; 10,000; 3,000; 1,000; 300; 100
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

  // 5) Deploy ZenBurnToRhino
  const ZenBurnToRhino = await hre.ethers.getContractFactory("ZenBurnToRhino");
  const burner = await ZenBurnToRhino.deploy(
    owner,
    ZEN_BASE,
    await rhino.getAddress(),
    tierCaps,
    tierRates
  );
  await burner.waitForDeployment();
  console.log("ZenBurnToRhino:", await burner.getAddress());

  // 6) Set minters
  // Burner must mint RHINO
  await (await rhino.setMinter(await burner.getAddress(), true)).wait();
  console.log("Set minter: burner ✅");

  // If later you add passive RHINO minting in Game, you can enable this.
  // For now Game only burns/locks RHINO, so no mint needed.
  // await (await rhino.setMinter(await game.getAddress(), true)).wait();

  // 7) Transfer CityNFT ownership to Game or keep to deployer?
  // If you want Game to mint cities via createCity(), CityNFT must allow Game to mint.
  // CityNFT.mintCity() is onlyOwner, and in Game.createCity() it calls CITY.mintCity(msg.sender).
  // That means CityNFT owner must be Game.
  await (await city.transferOwnership(await game.getAddress())).wait();
  console.log("Transferred CityNFT ownership to Game ✅");

  // 8) Optional: configure attack cost/cooldown
  // Example: 10 min cooldown, cost 10 RHINO
  const cooldown = 10 * 60;
  const attackCostRhino = e18("10");
  await (await game.setAttackParams(cooldown, attackCostRhino)).wait();
  console.log("Attack params set ✅");

  console.log("\n=== DONE ===");
  console.log("Owner/Treasury:", treasury);
  console.log("RHINO:", await rhino.getAddress());
  console.log("CityNFT:", await city.getAddress());
  console.log("Game:", await game.getAddress());
  console.log("Burner:", await burner.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
