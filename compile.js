const fs = require("fs");
const path = require("path");
const solc = require("solc");

const CONTRACTS_DIR = path.join(__dirname, "contracts");
const NODE_MODULES = path.join(__dirname, "node_modules");

function findImports(importPath) {
  const candidates = [
    path.join(CONTRACTS_DIR, importPath),
    path.join(NODE_MODULES, importPath),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { contents: fs.readFileSync(candidate, "utf8") };
    }
  }
  return { error: `File not found: ${importPath}` };
}

function walk(dir, base) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walk(full, rel));
    } else if (entry.name.endsWith(".sol")) {
      files.push(rel);
    }
  }
  return files;
}

const contractFiles = walk(CONTRACTS_DIR, "");

const sources = {};
for (const file of contractFiles) {
  sources[file] = { content: fs.readFileSync(path.join(CONTRACTS_DIR, file), "utf8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

let hasError = false;
if (output.errors) {
  for (const err of output.errors) {
    if (err.severity === "error") {
      hasError = true;
      console.error(err.formattedMessage);
    } else {
      console.warn(err.formattedMessage);
    }
  }
}
if (hasError) {
  process.exit(1);
}

const artifactsDir = path.join(__dirname, "build");
fs.mkdirSync(artifactsDir, { recursive: true });

const wanted = ["GradToken", "GradVesting", "GradStaking", "MaliciousReentrantToken"];
const result = {};
for (const file of Object.keys(output.contracts)) {
  for (const contractName of Object.keys(output.contracts[file])) {
    if (!wanted.includes(contractName)) continue;
    const c = output.contracts[file][contractName];
    result[contractName] = {
      abi: c.abi,
      bytecode: "0x" + c.evm.bytecode.object,
      deployedBytecode: "0x" + c.evm.deployedBytecode.object,
    };
  }
}

for (const name of wanted) {
  if (!result[name]) {
    console.error(`Missing expected contract in output: ${name}`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(artifactsDir, `${name}.json`), JSON.stringify(result[name], null, 2));
  console.log(
    `Compiled ${name}: bytecode ${((result[name].bytecode.length - 2) / 2)} bytes, ${result[name].abi.length} ABI entries`
  );
}

console.log("Compilation successful.");
