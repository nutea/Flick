import { readFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const readArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};

const platform = readArg('--platform', process.platform);
const arch = readArg('--arch', process.arch);
const artifact = path.resolve(
  readArg(
    '--file',
    'packages/flick-native/native/flick_native.node'
  )
);
const buffer = readFileSync(artifact);

const fail = (message) => {
  console.error(`[native-artifact] ${message}`);
  process.exit(1);
};

const expectedPeMachine = { x64: 0x8664, arm64: 0xaa64 }[arch];
const expectedMachCpu = { x64: 0x01000007, arm64: 0x0100000c }[arch];
const expectedElfMachine = { x64: 0x3e, arm64: 0xb7 }[arch];

if (!expectedPeMachine || !expectedMachCpu || !expectedElfMachine) {
  fail(`unsupported architecture: ${arch}`);
}

if (platform === 'win32') {
  if (buffer.length < 64 || buffer.toString('ascii', 0, 2) !== 'MZ') {
    fail(`${artifact} is not a Windows PE binary`);
  }

  const peOffset = buffer.readUInt32LE(0x3c);
  if (
    peOffset + 6 > buffer.length ||
    buffer.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0'
  ) {
    fail(`${artifact} has an invalid PE header`);
  }

  const machine = buffer.readUInt16LE(peOffset + 4);
  if (machine !== expectedPeMachine) {
    fail(
      `${artifact} has PE machine 0x${machine.toString(16)}, expected ${arch} (0x${expectedPeMachine.toString(16)})`
    );
  }
} else if (platform === 'darwin') {
  if (buffer.length < 8) fail(`${artifact} has an invalid Mach-O header`);

  const magic = buffer.readUInt32LE(0);
  if (magic !== 0xfeedfacf) {
    fail(`${artifact} is not a 64-bit little-endian Mach-O binary`);
  }

  const cpu = buffer.readUInt32LE(4);
  if (cpu !== expectedMachCpu) {
    fail(
      `${artifact} has Mach-O CPU 0x${cpu.toString(16)}, expected ${arch} (0x${expectedMachCpu.toString(16)})`
    );
  }
} else if (platform === 'linux') {
  if (
    buffer.length < 20 ||
    buffer[0] !== 0x7f ||
    buffer.toString('ascii', 1, 4) !== 'ELF'
  ) {
    fail(`${artifact} is not an ELF binary`);
  }

  const machine = buffer.readUInt16LE(18);
  if (machine !== expectedElfMachine) {
    fail(
      `${artifact} has ELF machine 0x${machine.toString(16)}, expected ${arch} (0x${expectedElfMachine.toString(16)})`
    );
  }
} else {
  fail(`unsupported platform: ${platform}`);
}

console.log(`[native-artifact] verified ${platform}/${arch}: ${artifact}`);
