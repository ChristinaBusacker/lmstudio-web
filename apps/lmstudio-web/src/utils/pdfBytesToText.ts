import { PDFParse } from 'pdf-parse';

export async function pdfBytesToText(bytes: Buffer): Promise<string> {
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return (result.text ?? '').trim();
  } finally {
    await parser.destroy();
  }
}
