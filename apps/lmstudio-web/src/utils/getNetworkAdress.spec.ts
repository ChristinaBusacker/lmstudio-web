import { getNetworkAddresses } from './getNetworkAdress';

jest.mock('os', () => ({
  networkInterfaces: () => ({
    lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    eth0: [
      { family: 'IPv4', internal: false, address: '192.168.0.2' },
      { family: 'IPv6', internal: false, address: '::1' },
    ],
  }),
}));

describe('getNetworkAddresses', () => {
  it('returns non-internal IPv4 addresses', () => {
    expect(getNetworkAddresses()).toEqual(['192.168.0.2']);
  });
});
