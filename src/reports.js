import { peso, sssBracketLabel } from './payroll.js';
import { SOURCE_DATE } from './schedules.js';

const filename = 'paycheck-ph-salary-breakdown';
export function reportRows(r, custom) {
  return [
    ...(r.name ? [['Employee', r.name]] : []),
    ['Employment', r.government ? 'Government employee' : 'Private employee'],
    ['Frequency', r.frequencyLabel],
    ...(r.daysWorked != null ? [['Days worked this pay period', String(r.daysWorked)]] : []),
    ['Schedules', custom ? 'Custom settings' : `${SOURCE_DATE} reference`],
    ...(r.companyPayroll ? [['Payroll method', 'Company cutoff: SSS from cutoff earnings; PhilHealth 2.5% and Pag-IBIG 2% (max PHP 200) of cutoff basic pay.']]
      : !r.government ? [['Private employee share rules', 'PhilHealth: 2.5% of basic pay; Pag-IBIG: PHP 200/month.']] : []),
    ['EARNINGS'], ...r.earnings, ['Gross earnings', r.gross],
    ['EMPLOYEE DEDUCTIONS'], ...r.shares.map(s => [s.label, s.employee]),
    ['Employee contribution total', r.contributions], ['Withholding tax', r.tax], ['Other deductions', r.otherDeduction],
    ['Total deductions', r.totalDeductions], ['NET TAKE-HOME PAY', r.net],
    ['WITHHOLDING DETAILS'], ['Tax-exempt compensation', r.exclusions],
    ...(r.companyPayroll ? [['Taxable pay before contributions', r.taxableBeforeContributions]] : []),
    ['Taxable compensation', r.taxable],
    ['Tax bracket', `${r.taxDetails.bracket} (${r.taxDetails.rate * 100}% marginal rate)`],
    ...(r.frequency === 'biweekly' ? [['Annualized taxable compensation', r.taxDetails.comparison]] : []),
    ['EMPLOYER SHARES (not deducted)'],
    ...r.shares.flatMap(s => [[s.label, s.employer], ...(s.ec ? [['Employees’ Compensation (EC)', s.ec]] : [])]),
    ['Employer contribution total', r.employerCost],
    ...(r.sss ? [
      [r.companyPayroll ? 'SSS bracket applied to cutoff pay' : 'SSS monthly compensation bracket', sssBracketLabel(r.sss, amount => peso(amount).replace('₱', 'PHP '))],
      ['SSS monthly salary credit', r.sss.msc],
    ] : []),
    [r.companyPayroll ? 'Employer PhilHealth and Pag-IBIG allocation' : 'Monthly share applied', `${(r.contributionFactor * 100).toFixed(2)}%`],
    ['Note', 'Estimate only. Verify amounts with your employer.'],
  ];
}

export async function downloadPDF(r, custom) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF();
  pdf.setProperties({ title: 'Paycheck PH | Salary breakdown' });
  const heading = () => {
    pdf.setFillColor(17, 28, 48);
    pdf.rect(0, 0, 210, 26, 'F');
    pdf.setTextColor(255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.text('Paycheck PH | Salary breakdown', 15, 16);
  };
  heading();
  let y = 33;
  for (const [label, value] of reportRows(r, custom)) {
    pdf.setFontSize(10);
    const text = typeof value === 'number' ? peso(value).replace('₱', 'PHP ') : value || '';
    const lines = pdf.splitTextToSize(text, 100);
    const height = Math.max(6.7, lines.length * 4.5 + 2);
    if (y + height > 282) {
      pdf.addPage();
      heading();
      y = 33;
    }
    if (value === undefined || label === 'NET TAKE-HOME PAY') {
      pdf.setFillColor(235, 248, 243);
      pdf.rect(14, y - 4.4, 182, height, 'F');
    }
    pdf.setTextColor(23, 36, 57);
    pdf.setFont('helvetica', value === undefined || label === 'NET TAKE-HOME PAY' ? 'bold' : 'normal');
    pdf.text(label, 17, y);
    if (text) pdf.text(lines, 193, y, { align: 'right' });
    y += height;
  }
  pdf.save(`${filename}.pdf`);
}

export async function downloadExcel(r, custom) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const sheet = reportRows(r, custom).map(([label, value]) => {
    const highlight = value === undefined || label === 'NET TAKE-HOME PAY';
    const style = highlight ? { fontWeight: 'bold', backgroundColor: '#EBF8F3' } : {};
    return [
      { value: label, ...style },
      typeof value === 'number'
        ? { value, type: Number, format: '"₱"#,##0.00;-"₱"#,##0.00', ...style }
        : { value: value || '', type: String, ...style },
    ];
  });
  await writeExcelFile(sheet, { sheet: 'Salary Breakdown', columns: [{ width: 36 }, { width: 53 }] }).toFile(`${filename}.xlsx`);
}
