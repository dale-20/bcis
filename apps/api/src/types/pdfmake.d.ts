declare module 'pdfmake' {
  interface PdfDocument { getBuffer(): Promise<Buffer> }
  interface PdfMake {
    setFonts(fonts: Record<string, Record<string, string>>): void;
    setUrlAccessPolicy(policy: (url: string) => boolean): void;
    setLocalAccessPolicy(policy: (path: string) => boolean): void;
    createPdf(definition: unknown): PdfDocument;
  }
  const pdfmake: PdfMake;
  export default pdfmake;
}
