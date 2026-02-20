jest.mock('pdf-parse', () => {
  return {
    PDFParse: jest.fn().mockImplementation(() => ({
      getText: jest.fn(async () => ({ text: '  Hello PDF  ' })),
      destroy: jest.fn(async () => undefined),
    })),
  };
});

import { pdfBytesToText } from './pdfBytesToText';
import { PDFParse } from 'pdf-parse';

describe('pdfBytesToText', () => {
  it('extracts text and always destroys parser', async () => {
    const text = await pdfBytesToText(Buffer.from('x'));
    expect(text).toBe('Hello PDF');
    expect(PDFParse).toHaveBeenCalled();
    const instance = (PDFParse as unknown as jest.Mock).mock.results[0]!.value;
    expect(instance.destroy).toHaveBeenCalled();
  });
});
