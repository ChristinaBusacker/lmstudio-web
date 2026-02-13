import os from 'os';

export function getNetworkAddresses(): string[] {
  const nets = os.networkInterfaces();
  const results: string[] = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }

  return results;
}
