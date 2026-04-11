import { NextRequest } from "next/server";
import ExcelJS from "exceljs";

interface ExpenseRow {
  description: string;
  date: string;
  sekAmount: number | null;
  vat: number | null;
  category: string;
  receiptReady: boolean;
  note: string;
}

const MONTH_NAMES = [
  "JANUARI", "FEBRUARI", "MARS", "APRIL", "MAJ", "JUNI",
  "JULI", "AUGUSTI", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DECEMBER",
];

const CATEGORY_LABELS: Record<string, string> = {
  monthly: "Manadsprenumerationer",
  one_time: "Engangskostnader",
  facebook_ads: "Facebook ads",
  google_ads: "Google ads",
};

export async function POST(req: NextRequest) {
  const { person, month, expenses } = (await req.json()) as {
    person: string;
    month: string;
    expenses: ExpenseRow[];
  };

  const [year, monthNum] = month.split("-");
  const monthName = MONTH_NAMES[parseInt(monthNum, 10) - 1] || "UNKNOWN";

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Blad1");

  // Column widths matching the original file
  sheet.getColumn(1).width = 55;
  sheet.getColumn(2).width = 14;
  sheet.getColumn(3).width = 16;
  sheet.getColumn(4).width = 20;
  sheet.getColumn(5).width = 12;
  sheet.getColumn(6).width = 50;

  // Row 1: Header
  const headerRow = sheet.getRow(1);
  headerRow.getCell(1).value = `Egna utlagg till ${person} - ${monthName}`;
  headerRow.getCell(1).font = { bold: true, size: 18 };
  headerRow.getCell(2).value = "Datum";
  headerRow.getCell(2).font = { bold: true, size: 14 };
  headerRow.getCell(3).value = "SEK";
  headerRow.getCell(3).font = { bold: true, size: 14 };
  headerRow.getCell(4).value = "Varav MOMS";
  headerRow.getCell(4).font = { bold: true, size: 14 };
  headerRow.getCell(5).value = "PDF klar";
  headerRow.getCell(5).font = { bold: true, size: 14 };
  headerRow.getCell(6).value = "Anteckning";
  headerRow.getCell(6).font = { bold: true, size: 14 };

  const krFormat = "#,##0.00";
  let rowNum = 2;
  const dataStartRow = 2;

  // Group by category and write sections
  const categories = ["monthly", "one_time", "facebook_ads", "google_ads"];
  for (const cat of categories) {
    const items = expenses.filter((e) => e.category === cat);
    if (items.length === 0) continue;

    // Section header
    const sectionRow = sheet.getRow(rowNum);
    sectionRow.getCell(1).value = CATEGORY_LABELS[cat] || cat;
    sectionRow.getCell(1).font = { bold: true, size: 12 };
    rowNum++;

    // Data rows
    for (const expense of items) {
      const row = sheet.getRow(rowNum);
      row.getCell(1).value = expense.description;
      row.getCell(1).font = { size: 12 };

      if (expense.date) {
        row.getCell(2).value = new Date(expense.date);
        row.getCell(2).numFmt = "YYYY-MM-DD";
      }

      if (expense.sekAmount != null) {
        row.getCell(3).value = expense.sekAmount;
        row.getCell(3).numFmt = krFormat;
      }

      if (expense.vat != null) {
        row.getCell(4).value = expense.vat;
        row.getCell(4).numFmt = krFormat;
      }

      row.getCell(5).value = expense.receiptReady;

      if (expense.note) {
        row.getCell(6).value = expense.note;
      }

      rowNum++;
    }

    rowNum++; // blank row between sections
  }

  // Totals row
  rowNum++;
  const sumRow = sheet.getRow(rowNum);
  sumRow.getCell(2).value = "Totalt: ";
  sumRow.getCell(2).font = { bold: true };
  sumRow.getCell(3).value = {
    formula: `SUM(C${dataStartRow}:C${rowNum - 1})`,
  };
  sumRow.getCell(3).numFmt = krFormat;
  sumRow.getCell(3).font = { bold: true };
  sumRow.getCell(4).value = {
    formula: `SUM(D${dataStartRow}:D${rowNum - 1})`,
  };
  sumRow.getCell(4).numFmt = krFormat;

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `Egna utlagg ${person} ${monthName} ${year}.xlsx`;

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
