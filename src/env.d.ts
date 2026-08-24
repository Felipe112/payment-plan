/// <reference types="astro/client" />

declare module 'exceljs/dist/exceljs.min.js' {
  import type ExcelJS from 'exceljs';
  const value: typeof ExcelJS;
  export default value;
}
