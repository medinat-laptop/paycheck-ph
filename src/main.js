import './style.css';
import { DEFAULT_INPUTS, FREQUENCIES, calculate, peso, round, sssBracketLabel } from './payroll.js';
import { DEFAULT_RULES, SOURCE_DATE, SOURCES, parseRules } from './schedules.js';
import { reportRows, downloadPDF, downloadExcel } from './reports.js';
import { HolidayCalculationError } from './holiday.js';
import calculator from 'lucide-static/icons/calculator.svg?raw';
import wallet from 'lucide-static/icons/wallet.svg?raw';
import shield from 'lucide-static/icons/shield-check.svg?raw';
import book from 'lucide-static/icons/book-open.svg?raw';
import settings from 'lucide-static/icons/settings.svg?raw';
import building from 'lucide-static/icons/building-2.svg?raw';
import landmark from 'lucide-static/icons/landmark.svg?raw';
import person from 'lucide-static/icons/user-round.svg?raw';
import refresh from 'lucide-static/icons/rotate-ccw.svg?raw';
import printer from 'lucide-static/icons/printer.svg?raw';
import file from 'lucide-static/icons/file-text.svg?raw';
import spreadsheet from 'lucide-static/icons/sheet.svg?raw';
import plus from 'lucide-static/icons/plus.svg?raw';
import moon from 'lucide-static/icons/moon.svg?raw';
import clock from 'lucide-static/icons/clock-3.svg?raw';
import minus from 'lucide-static/icons/minus.svg?raw';
import chevron from 'lucide-static/icons/chevron-down.svg?raw';
import arrow from 'lucide-static/icons/arrow-up-right.svg?raw';
import info from 'lucide-static/icons/info.svg?raw';
import menu from 'lucide-static/icons/menu.svg?raw';
import close from 'lucide-static/icons/x.svg?raw';
import chart from 'lucide-static/icons/chart-no-axes-column-increasing.svg?raw';

const icon = svg => `<span class="icon" aria-hidden="true">${svg}</span>`;
const action = (id, label, svg, style = '') => `<button type="button" class="button ${style}" id="${id}">${icon(svg)}${label}</button>`;
const nav = (id, label, svg, active = false) => `<a href="#${id}"${active ? ' aria-current="location"' : ''}>${icon(svg)}${label}</a>`;
const title = (label, caption, svg) => `<div class="card-title"><span class="tile">${icon(svg)}</span><div><h2>${label}</h2><p>${caption}</p></div></div>`;
const field = (name, label, options = {}) => {
  const { prefix = '', suffix = '', min = 0, max = 1e9, step = 'any', placeholder = '', type = 'number', optional = false } = options;
  return `<label class="field"><span>${label}${optional ? ' <small>Optional</small>' : ''}</span><span class="input-shell">
    ${prefix ? `<span class="affix">${prefix}</span>` : ''}<input name="${name}" type="${type}" ${type === 'number' ? `min="${min}" max="${max}" step="${step}" inputmode="${step === 1 ? 'numeric' : 'decimal'}"` : 'maxlength="100" autocomplete="off"'} placeholder="${placeholder}">${suffix ? `<span class="affix">${suffix}</span>` : ''}
    </span></label>`;
};
const cash = (name, label, options) => field(name, label, { prefix: '₱', ...options });
const toggle = (name, label, text = '') => `<label class="toggle"><span><strong>${label}</strong>${text ? `<small>${text}</small>` : ''}</span><input type="checkbox" name="${name}"><span class="switch" aria-hidden="true"></span></label>`;
const select = (name, label, items) => `<label class="field"><span>${label}</span><span class="input-shell select-shell"><select name="${name}">${items.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>${icon(chevron)}</span></label>`;
const option = (id, label, caption, svg, body) => `<details class="option" id="${id}"><summary>${icon(svg)}<span><strong>${label}</strong><small>${caption}</small></span>${icon(chevron)}</summary><div class="option-body">${body}</div></details>`;
const group = (name, content) => `<fieldset class="fields conditional" data-controlled="${name}" aria-label="Settings">${content}</fieldset>`;

document.querySelector('#app').innerHTML = `
  <aside class="sidebar" id="sidebar">
    <a class="brand" href="#calculator"><span class="brandmark">${icon(calculator)}</span><span>Paycheck<span class="brand-ph"> PH</span><small>PAYROLL CALCULATOR</small></span></a>
    <p class="nav-caption">WORKSPACE</p>
    <nav aria-label="Workspace">${nav('calculator', 'Salary calculator', calculator, true)}${nav('contributions', 'Contributions', shield)}${nav('summary', 'Salary breakdown', chart)}</nav>
    <p class="nav-caption">RESOURCES</p>
    <nav aria-label="Resources">${nav('sources', 'Sources & notes', book)}<button type="button" id="settings">${icon(settings)}Statutory settings</button></nav>
    <div class="sidebar-foot"><span class="country" aria-hidden="true">🇵🇭</span><span><strong>Philippine payroll</strong><small>Private & government</small></span></div>
  </aside>
  <div class="workspace">
    <header class="topbar"><div class="breadcrumb"><button id="menu" class="button mobile-menu" type="button" aria-expanded="false" aria-controls="sidebar" aria-label="Toggle navigation">${icon(menu)}</button><span>Workspace</span><b>/</b><strong>Salary calculator</strong></div><div class="schedule-badge"><span></span> ${SOURCE_DATE} reference</div></header>
    <main id="calculator">
      <header class="intro"><div><p class="eyebrow">PAYROLL TOOLS</p><h1>Philippine Salary Calculator</h1><p>Estimate your take-home pay, government contributions, and withholding tax.</p></div>${action('reset', 'Reset calculator', refresh, 'secondary')}</header>
      <div class="dashboard">
        <form id="inputs" novalidate>
          <section class="card employee">
            ${title('Employee details', 'Choose your sector and enter your base pay.', person)}
            <fieldset class="sector"><legend>Employment type</legend>
              <label><input type="radio" name="sector" value="private"><span>${icon(building)}Private employee</span></label>
              <label><input type="radio" name="sector" value="government"><span>${icon(landmark)}Government employee</span></label>
            </fieldset>
            <div class="fields">
              <div class="wide">${field('name', 'Employee name', { type: 'text', placeholder: 'e.g. Juan dela Cruz', optional: true })}</div>
              ${cash('salary', 'Monthly basic salary', { placeholder: '0.00' })}
              ${select('frequency', 'Payroll frequency', Object.entries(FREQUENCIES).map(([v, [t]]) => [v, t]))}
              ${field('days', 'Working days per month', { min: 1, max: 31, step: 1, suffix: 'days' })}
              ${field('hours', 'Working hours per day', { min: .01, max: 24, suffix: 'hrs' })}
              <div class="wide">${field('daysWorked', 'Days worked this pay period', { max: 31, optional: true, suffix: 'days', placeholder: 'e.g. 10' })}</div>
              <p class="wide hint">Working days per month sets the automatic daily rate. Days worked this pay period sets how many days are paid this cutoff. Leave the cutoff field blank for standard pay.</p>
            </div>
            <div class="rate-box fields">
              ${cash('dailyRate', 'Daily rate', { optional: true })}
              ${cash('hourlyRate', 'Hourly rate', { optional: true })}
              <p class="wide hint">Rates are calculated automatically. Enter a value to override either rate.</p>
            </div>
            <div class="rate-box" id="company-payroll">
              ${toggle('companyPayroll', 'Use company cutoff calculation', 'Private semi-monthly payroll: use actual days worked and apply company deduction rules.')}
              ${group('companyPayroll',
                `<div class="wide">${toggle('datedHolidayMode', 'Calculate holiday premiums by calendar date', 'Only changes holiday premiums. Basic pay, night differential, and other calculations stay unchanged.')}</div>
                <div id="dated-holiday-fields" class="wide" hidden>
                  <p class="hint">Enter each shift worked this cutoff. Shifts split at midnight; assign the type for each calendar date. Unpaid breaks are excluded. The hourly basic pay remains in Basic salary; only the additional holiday premium is calculated here.</p>
                  <div id="holiday-shift-list"></div>${action('add-holiday-shift', 'Add holiday shift', plus, 'secondary')}
                </div>
                <div id="legacy-holiday-fields" class="fields">
                  ${field('specialDays', 'Special non-working holidays worked', { max: 31, suffix: 'days' })}
                  ${field('regularHolidayDays', 'Regular holidays worked', { max: 31, suffix: 'days' })}
                </div>` +
                cash('dailyExemptAllowance', 'Non-taxable allowance per day') +
                cash('companyNightPremium', 'Night differential per eligible hour') +
                field('companyNightHours', 'Eligible night hours per worked day', { max: 8, suffix: 'hrs' }))}
              <p class="hint" id="company-payroll-note">Include holiday work in your total days worked. The calculator adds 30% for special non-working holidays and another 100% for regular holidays (200% total). Enter only eligible paid night hours, excluding unpaid breaks, and allowances verified as tax-exempt.</p>
            </div>
          </section>
          <section class="card" id="contributions">
            ${title('Statutory contributions', 'Choose which shares to include in this paycheck.', shield)}
            <div class="toggles">
              ${toggle('insurance', '<span id="insurance-label">Deduct SSS</span>', '<span id="insurance-caption">Social Security System</span>')}
              ${toggle('health', 'Deduct PhilHealth', '<span id="health-caption"></span>')}
              ${toggle('hdmf', 'Deduct Pag-IBIG', '<span id="hdmf-caption"></span>')}
            </div>
            <p class="hint" id="private-overrides">Private payroll overrides may differ from statutory employee shares. Employer shares still use the configured statutory schedule.</p>
            ${option('contribution-options', 'Contribution basis & timing', 'Optional monthly basis and cutoff overrides', settings,
              `<div class="fields">${cash('insuranceBasis', '<span id="basis-label">SSS monthly compensation</span>')}<div data-government-only>${cash('healthBasis', 'PhilHealth monthly basic salary')}</div><div data-government-only>${cash('hdmfBasis', 'Pag-IBIG monthly fund salary')}</div>${field('allocation', 'Monthly share taken this cutoff', { suffix: '%', max: 100 })}</div>
              <p class="hint">Leave blank for the estimated amounts. Use your actual monthly contribution basis and allocation if your employer collects contributions on different cutoffs.</p>`)}
          </section>
          <section class="card" id="adjustments">
            ${title('Pay adjustments', 'Add extra earnings, exclusions, or deductions for this period.', plus)}
            <div class="options">
              ${option('extra-pay', 'Allowances & bonuses', 'Taxable allowances and other compensation', plus,
                `${toggle('allowances', 'Enable allowances')}${group('allowances', cash('allowanceAmount', 'Taxable allowances'))}
                ${toggle('bonuses', 'Enable taxable bonuses & other pay')}${group('bonuses', cash('bonusAmount', 'Taxable bonuses and compensation'))}`)}
              ${option('night-pay', 'Night shift differential', 'Premium for eligible night work', moon,
                `${toggle('night', 'Enable night shift differential')}${group('night', field('nightHours', 'Eligible night hours per shift', { suffix: 'hrs' }) + field('nightShifts', 'Number of night shifts', { step: 1 }) + field('nightRate', 'Night differential rate', { suffix: '%' }) + cash('nightHourly', 'Night shift hourly rate'))}<p class="hint" id="night-hint"></p>`)}
              ${option('overtime-pay', 'Overtime pay', 'Ordinary, rest day, and holiday overtime', clock,
                `${toggle('overtime', 'Enable overtime')}${group('overtime',
                  field('ordinaryHours', 'Regular overtime hours', { suffix: 'hrs' }) + field('ordinaryMultiplier', 'Regular multiplier', { suffix: '×', max: 10 }) +
                  field('restHours', 'Rest day overtime hours', { suffix: 'hrs' }) + field('restMultiplier', 'Rest day multiplier', { suffix: '×', max: 10 }) +
                  field('holidayHours', 'Holiday overtime hours', { suffix: 'hrs' }) + field('holidayMultiplier', 'Holiday multiplier', { suffix: '×', max: 10 }) +
                  `<div class="wide">${select('holidayType', 'Holiday category', [['regularHoliday', 'Regular holiday'], ['specialHoliday', 'Special non-working day'], ['holidayRest', 'Regular holiday on rest day'], ['specialRest', 'Special non-working day on rest day']])}</div>`)}<p class="hint" id="overtime-hint"></p>`)}
              ${option('exclusions', 'Tax-exempt compensation', 'Qualified benefits and minimum wage treatment', shield,
                `${toggle('benefits', 'Enable qualifying benefits')}${group('benefits',
                  cash('qualifyingBonus', 'Qualifying 13th-month pay / benefits') + cash('usedBonusExclusion', 'Annual exemption already used') +
                  `<div class="wide">${cash('exemptBenefit', 'Other verified tax-exempt pay')}</div>`)}
                <p class="hint">Enter only verified tax-exempt benefits (including eligible de minimis amounts). Qualifying 13th-month pay and other benefits use the remaining annual exemption.</p>
                ${toggle('minimumWage', 'Verified minimum wage earner', 'Excludes statutory basic pay and eligible overtime and night earnings. Verify the regional wage order (non-agricultural wage for public employees); enter any separate exempt holiday pay or hazard pay above.')}`)}
              ${option('other-deductions', 'Other deductions', 'Loans or other post-tax deductions', minus,
                `${toggle('deductions', 'Enable other deductions')}${group('deductions', cash('deductionAmount', 'Other deductions'))}`)}
            </div>
          </section>
        </form>
        <section class="result" id="summary" aria-label="Salary breakdown">
          <div class="net-card">
            <div class="net-head"><span class="net-icon">${icon(wallet)}</span><span id="period-badge" class="period"></span></div>
            <p>NET TAKE-HOME PAY</p><div class="net-amount"><strong id="net"></strong><small id="per-period"></small></div>
            <div class="net-metrics"><span>Gross earnings<strong id="gross"></strong></span><span>Total deductions<strong id="total-deductions"></strong></span></div>
          </div>
          <div class="card breakdown">
            <div class="breakdown-head">${title('Salary breakdown', 'A closer look at your paycheck.', chart)}</div>
            <div class="breakdown-body">
              <h3>EARNINGS</h3><div id="earnings"></div>
              <h3>EMPLOYEE DEDUCTIONS</h3><div id="deductions"></div>
              <details id="details" class="detail-block"><summary>Calculation details ${icon(chevron)}</summary><div id="calc-details"></div></details>
            </div>
          </div>
          <div class="export-bar">${action('print', 'Print', printer, 'secondary')}${action('pdf', 'Download PDF', file, 'secondary')}${action('excel', 'Export Excel', spreadsheet, 'secondary')}</div>
          <p class="status" id="status" role="status"></p>
          <p class="estimate">${icon(info)}<span>Estimates only. Verify your actual payroll with your employer.</span></p>
        </section>
      </div>
      <section id="sources" class="card references">
        ${title('Sources & assumptions', 'Know which schedules and assumptions this estimate uses.', book)}
        <div class="assumptions">
          <p>When days worked is entered, basic pay is the daily rate times actual days worked. Otherwise, monthly basic pay is prorated using 12, 24, 26, or 52 pay periods per year, and daily payroll uses the daily rate. Working days per month defaults to 22 for the automatic daily rate; use your employer’s divisor or rates.</p>
          <p>SSS estimates monthly compensation as monthly base pay plus adjustments entered for this cutoff. For government employees, GSIS and PhilHealth use monthly basic pay, and Pag-IBIG uses monthly basic pay plus entered allowances. For private employees, the employee shares use the payroll overrides shown above; employer shares still use the statutory salary bases and limits. Monthly shares are prorated unless you enter a cutoff percentage.</p>
          <p>Monthly, semi-monthly, weekly and daily use BIR Annex E. Bi-weekly has no separate Annex E table: this estimate applies annual rates to 26 times the cutoff taxable pay, then divides the tax by 26. This is not a year-end reconciliation.</p>
          <p>The optional company cutoff calculation follows a payslip convention, not a general statutory rule. It uses cutoff earnings for employee contributions and excludes the special holiday premium from withholding. Confirm with your payroll team before relying on it.</p>
          <p>Standard coverage only. Confirm special member rates, contribution exemptions, tax-exempt amounts, work schedules, and agency overtime authorizations and caps before using the estimate for payroll.</p>
        </div>
        <ul>${SOURCES.map(([label, url, note]) => `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${label}${icon(arrow)}</a><small>${note}</small></li>`).join('')}</ul>
      </section>
      <footer>Paycheck PH <span>•</span> Philippine Salary Calculator</footer>
    </main>
  </div>
  <dialog id="rules-dialog" aria-labelledby="rules-title">
    <div class="dialog-header"><div><p class="eyebrow">PAYROLL CONFIGURATION</p><h2 id="rules-title">Statutory settings</h2></div><button id="close-settings" type="button" class="button secondary" aria-label="Close settings">${icon(close)}</button></div>
    <p>Rates use decimals (0.05 = 5%), except night premiums, which use percent. BIR rows are <code>[minimum, fixed tax, rate]</code>. To replace the standard SSS table, set <code>sss.brackets</code> to rows of <code>[minimum pay, MSC, employee share, employer share excluding EC, EC]</code>, starting at zero. Changes apply only in this browser.</p>
    <label class="field"><span>Schedule configuration (JSON)</span><textarea id="rules-json" spellcheck="false" rows="16"></textarea></label>
    <p id="rules-error" role="alert"></p>
    <div class="dialog-actions">${action('restore-rules', 'Load defaults', refresh, 'secondary')}${action('save-rules', 'Apply settings', settings, 'primary')}</div>
  </dialog>
`;

const $ = id => document.getElementById(id);
const form = $('inputs');
const storageKey = 'paycheck-ph-schedules-v1';
let rules = DEFAULT_RULES;
let current;
let custom = false;
let holidayError = '';
let holidayShiftId = 0;
const holidayDayOptions = [['', 'Select date type'], ['ordinary', 'Regular working day'],
  ['specialHoliday', 'Special non-working holiday'], ['regularHoliday', 'Regular holiday']];
function addHolidayShift() {
  const id = `holiday-shift-${++holidayShiftId}`;
  const item = document.createElement('div');
  item.className = 'holiday-shift-entry';
  item.dataset.holidayShiftId = id;
  item.innerHTML = `<div class="shift-heading"><strong>Holiday shift</strong><button type="button" class="button secondary remove-holiday-shift">Remove</button></div>
    <div class="fields">
      ${field(`${id}-date`, 'Work date', { type: 'date' })}
      ${select(`${id}-type`, 'Work date type', holidayDayOptions)}
      ${field(`${id}-start`, 'Shift start', { type: 'time' })}
      ${field(`${id}-end`, 'Shift end', { type: 'time' })}
      ${select(`${id}-next`, 'Next calendar date type (overnight)', holidayDayOptions)}
      ${field(`${id}-breakStart`, 'Unpaid break start', { type: 'time', optional: true })}
      ${field(`${id}-breakEnd`, 'Unpaid break end', { type: 'time', optional: true })}
    </div>`;
  $('holiday-shift-list').append(item);
}
function resetHolidayShiftInputs() {
  $('holiday-shift-list').replaceChildren();
  holidayShiftId = 0;
  addHolidayShift();
}
function readHolidayShifts() {
  return [...$('holiday-shift-list').children].map(item => {
    const id = item.dataset.holidayShiftId;
    const value = name => form.elements[`${id}-${name}`].value;
    return { date: value('date'), dayType: value('type'), start: value('start'), end: value('end'),
      nextDayType: value('next'), breakStart: value('breakStart'), breakEnd: value('breakEnd') };
  });
}
let startupError = '';
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    rules = parseRules(saved);
    custom = true;
  }
} catch (error) {
  startupError = `Unable to load custom schedules. Official defaults are in use. ${error.message}`;
}

function populate() {
  for (const [name, value] of Object.entries(DEFAULT_INPUTS)) {
    const control = form.elements.namedItem(name);
    if (control.type === 'checkbox') control.checked = value;
    else control.value = value;
  }
}

const row = (label, amount, total = false) =>
  `<div class="line${total ? ' line-total' : ''}"><span>${label}</span><strong${amount === 0 ? ' class="zero"' : ''}>${typeof amount === 'number' ? peso(amount) : amount}</strong></div>`;
function renderDetails(r) {
  const t = r.taxDetails;
  const band = t.rate
    ? `${t.bracket === 2 ? 'Over ' : 'From '}${peso(t.lower)}${t.upper == null ? '' : ` to under ${peso(t.upper)}`}`
    : `Up to ${peso(t.upper)}`;
  const taxFormula = !t.rate ? 'No tax in this bracket' :
    `${peso(t.fixed)} + (${peso(t.excess)} × ${t.rate * 100}%)${t.divisor > 1 ? `, then ÷ ${t.divisor}` : ''}`;
  const sss = r.sss;
  $('calc-details').innerHTML = `
    ${r.holidayCalculation ? `<h4>Date-based holiday premium</h4>
      <p class="hint">Each shift is split at calendar midnight. Basic hourly pay is already included in Basic salary; only the additional holiday premium is added here. Break time is excluded.</p>
      ${r.holidayCalculation.segments.map(s => `<div class="holiday-result"><strong>${s.date} · ${s.start}–${s.end} · ${s.label}</strong><small>${s.hours} paid hrs × ${peso(s.hourlyRate)}/hr × ${s.multiplier}× = ${peso(s.hourlyRate * s.multiplier)}/hr total rate</small><small>Holiday premium: ${s.hours} × ${peso(s.hourlyRate)} × ${s.multiplier - 1} = ${peso(s.premium)}</small></div>`).join('')}
      <p class="hint">Paid hours: ${r.holidayCalculation.paidHours}; unpaid break: ${r.holidayCalculation.unpaidBreakHours} hrs. Total additional holiday premium: ${peso(r.holidayCalculation.totalPremium)}.</p>` : ''}
    <h4>Withholding tax</h4>
    ${row('Gross compensation', r.gross)}${row('Less tax-exempt compensation', r.exclusions)}
    ${r.companyPayroll ? row('Taxable pay before contributions', r.taxableBeforeContributions) : ''}
    ${row('Less employee contributions', r.contributions)}${row('Taxable compensation', r.taxable, true)}
    ${r.frequency === 'biweekly' ? row('Annualized taxable compensation', t.comparison) : ''}
    ${row(`Bracket ${t.bracket} · ${t.rate * 100}% marginal rate`, band)}
    <p class="hint">${taxFormula}</p>${row('Withholding tax', r.tax, true)}
    <h4>Contribution shares</h4>
    <p class="hint">${r.companyPayroll ? 'Company cutoff: SSS uses cutoff basic pay, night differential, and holiday premiums; the full bracket share is applied. Employee PhilHealth and Pag-IBIG use cutoff basic pay. Employer PhilHealth and Pag-IBIG remain monthly prorated estimates.' : `${(r.contributionFactor * 100).toFixed(2)}% of each monthly share applied this cutoff.`} Employer shares and EC do not reduce your take-home pay.</p>
    <table><thead><tr><th>Plan</th><th>Employee</th><th>Employer</th></tr></thead><tbody>
      ${r.shares.map(s => `<tr><th scope="row">${s.label}${!s.enabled ? '<small>Not deducted</small>' : !r.government && !r.companyPayroll && s.key === 'hdmf' ? '<small>Fixed employee share</small>' : `<small>${peso(s.basis)} ${r.companyPayroll ? 'cutoff basis' : !r.government && s.key === 'health' ? 'monthly basic pay' : 'monthly basis'}</small>`}</th><td>${peso(s.employee)}</td><td>${peso(s.employer)}</td></tr>${s.ec ? `<tr><th scope="row">EC</th><td>${peso(0)}</td><td>${peso(s.ec)}</td></tr>` : ''}`).join('')}
      <tr class="table-total"><th scope="row">Total</th><td>${peso(r.contributions)}</td><td>${peso(r.employerCost)}</td></tr>
    </tbody></table>
    ${sss ? `<h4 id="sss-schedule-heading">${r.companyPayroll ? 'SSS schedule applied to this cutoff' : 'SSS monthly schedule'}</h4>
      <p class="hint">Compensation bracket: ${sssBracketLabel(sss)} · Monthly salary credit: ${peso(sss.msc)}</p>
      <table aria-labelledby="sss-schedule-heading"><thead><tr><th>Component</th><th>Employee</th><th>Employer</th></tr></thead><tbody>
      ${sss.mpfEmployee != null ? `<tr><th scope="row">Regular SSS</th><td>${peso(round(sss.employee - sss.mpfEmployee))}</td><td>${peso(round(sss.employer - sss.mpfEmployer))}</td></tr>
      <tr><th scope="row">MPF</th><td>${peso(sss.mpfEmployee)}</td><td>${peso(sss.mpfEmployer)}</td></tr>` : ''}
      <tr><th scope="row">EC</th><td>${peso(0)}</td><td>${peso(sss.ec)}</td></tr>
      <tr class="table-total"><th scope="row">${r.companyPayroll ? 'Cutoff total' : 'Monthly total'}</th><td>${peso(sss.employee)}</td><td>${peso(round(sss.employer + sss.ec))}</td></tr>
      </tbody></table>` : ''}
    ${r.nightWork && (r.companyPayroll || form.elements.night.checked) ? `<h4>Night differential</h4><p class="hint">${r.companyPayroll
      ? `${peso(r.companyNightPremium)} premium per hour × ${r.nightWork} eligible hours`
      : `${peso(r.nightHourly)} × ${r.nightWork} eligible hours × ${r.nightRate}%`}</p>` : ''}
  `;
}

function update() {
  const values = {};
  for (const name of Object.keys(DEFAULT_INPUTS)) {
    const control = form.elements.namedItem(name);
    values[name] = control.type === 'checkbox' ? control.checked : control.value;
  }
  if (values.companyPayroll && values.datedHolidayMode) values.holidayShifts = readHolidayShifts();
  let r;
  holidayError = '';
  try {
    r = current = calculate(values, rules);
  } catch (error) {
    if (!(error instanceof HolidayCalculationError)) throw error;
    holidayError = error.message;
    current = null;
    $('status').textContent = `Date-based holiday calculation: ${holidayError}`;
    for (const id of ['net', 'gross', 'total-deductions']) $(id).textContent = '—';
    for (const id of ['earnings', 'deductions', 'calc-details']) $(id).replaceChildren();
    for (const id of ['print', 'pdf', 'excel']) $(id).disabled = true;
    return false;
  }
  for (const id of ['print', 'pdf', 'excel']) $(id).disabled = false;
  const f = form.elements;
  for (const group of form.querySelectorAll('[data-controlled]')) group.disabled = !values[group.dataset.controlled];
  const companyAvailable = !r.government && r.frequency === 'semi';
  $('company-payroll').hidden = !companyAvailable;
  f.companyPayroll.disabled = !companyAvailable;
  $('company-payroll-note').hidden = !r.companyPayroll;
  form.querySelector('[data-controlled="companyPayroll"]').hidden = !r.companyPayroll;
  form.querySelector('[data-controlled="companyPayroll"]').disabled = !r.companyPayroll;
  $('dated-holiday-fields').hidden = !r.companyPayroll || !values.datedHolidayMode;
  $('legacy-holiday-fields').hidden = values.datedHolidayMode;
  f.specialDays.disabled = !r.companyPayroll || values.datedHolidayMode;
  f.regularHolidayDays.disabled = !r.companyPayroll || values.datedHolidayMode;
  for (const control of $('dated-holiday-fields').querySelectorAll('input, select, button')) {
    control.disabled = !r.companyPayroll || !values.datedHolidayMode;
  }
  f.daysWorked.required = r.companyPayroll;
  const tooManyHolidays = r.companyPayroll && !values.datedHolidayMode &&
    (Number(values.specialDays) + Number(values.regularHolidayDays) > (r.daysWorked ?? 0));
  f.regularHolidayDays.setCustomValidity(tooManyHolidays ? 'Total holiday days cannot exceed days worked this pay period.' : '');
  $('night-pay').hidden = r.companyPayroll;
  f.night.disabled = r.companyPayroll;
  form.querySelector('[data-controlled="night"]').disabled = r.companyPayroll || !values.night;
  for (const [fieldName, key] of [['insuranceBasis', 'insurance'], ['healthBasis', 'health'], ['hdmfBasis', 'hdmf']]) {
    f[fieldName].disabled = r.companyPayroll || !values[key] || (!r.government && key !== 'insurance');
  }
  form.querySelector('#contribution-options .field').hidden = r.companyPayroll;
  for (const wrapper of form.querySelectorAll('[data-government-only]')) wrapper.hidden = !r.government;
  $('private-overrides').hidden = r.government;
  $('private-overrides').textContent = r.companyPayroll
    ? 'Company cutoff rules are not general statutory advice. The special holiday premium is included for SSS but excluded from withholding.'
    : 'Private payroll overrides may differ from statutory employee shares. Employer shares still use the configured statutory schedule.';
  $('health-caption').textContent = r.government ? 'Philippine Health Insurance Corporation' : r.companyPayroll ? '2.5% of cutoff basic pay' : '2.5% of monthly basic pay, no floor or ceiling';
  $('hdmf-caption').textContent = r.government ? 'Home Development Mutual Fund' : r.companyPayroll ? '2% of cutoff basic pay, up to ₱200' : '₱200 monthly employee share';
  $('insurance-label').textContent = `Deduct ${r.government ? 'GSIS' : 'SSS'}`;
  $('insurance-caption').textContent = r.government ? 'Government Service Insurance System' : r.companyPayroll ? 'Full bracket share based on this cutoff' : 'Social Security System';
  $('basis-label').textContent = `${r.government ? 'GSIS covered' : 'SSS'} monthly compensation`;
  const night = rules.night[values.sector];
  f.nightRate.min = night.min;
  f.nightRate.max = night.max;
  f.nightHours.max = night.maxHours;
  f.companyNightHours.max = rules.night.private.maxHours;
  const otRules = rules.overtime[values.sector];
  for (const [name, min] of [['ordinaryMultiplier', otRules.ordinary], ['restMultiplier', otRules.rest], ['holidayMultiplier', otRules[values.holidayType]]]) {
    f[name].min = r.government ? 1 : min;
  }
  $('night-hint').textContent = r.government
    ? 'For eligible and agency-authorized work, 6:00 PM–6:00 AM. Enter the approved rate (up to 20%; public health workers have a 10% minimum). Exclude excess hours paid as government overtime.'
    : 'Count only eligible hours from 10:00 PM–6:00 AM. For night hours overlapping overtime or premium work, use the applicable premium hourly rate. Split mixed rates into separate calculations.';
  $('overtime-hint').textContent = r.government
    ? `Government premium hourly basis: ${peso(r.premiumHourly)}. Enter only approved paid hours; agency and annual caps must be verified separately.`
    : `Private premium hourly basis: ${peso(r.premiumHourly)}. Enter overtime beyond eight hours. First-eight-hour holiday/rest-day premiums and double holidays are not inferred.`;
  for (const [name, value] of Object.entries({
    dailyRate: r.dailyRate, hourlyRate: r.hourlyRate, insuranceBasis: r.insuranceBasis,
    healthBasis: r.healthBasis, hdmfBasis: r.hdmfBasis, allocation: r.contributionFactor * 100,
    nightRate: r.nightRate, nightHourly: r.nightHourly, ordinaryMultiplier: r.ordinaryMultiplier,
    restMultiplier: r.restMultiplier, holidayMultiplier: r.holidayMultiplier,
  })) f[name].placeholder = Number(value.toFixed(2)).toLocaleString('en-PH', { maximumFractionDigits: 2 });
  $('net').textContent = peso(r.net);
  $('per-period').textContent = `/ ${r.periodLabel}`;
  $('period-badge').textContent = r.companyPayroll ? 'Company cutoff' : r.frequencyLabel;
  $('gross').textContent = peso(r.gross);
  $('total-deductions').textContent = peso(r.totalDeductions);
  $('earnings').innerHTML = r.earnings.map(([label, money], index) =>
    row(index === 0 && r.daysWorked != null ? `${label} (${r.daysWorked} days worked)` : label, money)
  ).join('') + row('Total gross earnings', r.gross, true);
  $('deductions').innerHTML = r.shares.map(s => row(s.label, s.employee)).join('') +
    row('Employee contribution subtotal', r.contributions) + row('Withholding tax', r.tax) +
    row('Other deductions', r.otherDeduction) + row('Total deductions', r.totalDeductions, true);
  renderDetails(r);
  return tooManyHolidays;
}

form.addEventListener('input', () => {
  const tooManyHolidays = update();
  $('status').textContent = form.elements.daysWorked.validity.valueMissing ? 'Enter the days worked this pay period to calculate company basic pay.'
    : tooManyHolidays ? 'Total holiday days cannot exceed days worked this pay period. The estimate caps the holiday days used.'
    : holidayError ? `Date-based holiday calculation: ${holidayError}`
    : Array.from(form.elements).some(control => !control.validity?.valid && control.willValidate)
      ? 'Check the highlighted fields. The estimate uses supported limits for out-of-range values.' : '';
});
form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('change', event => {
  if (event.target.name === 'sector') {
    for (const name of ['insuranceBasis', 'nightRate', 'nightHourly', 'ordinaryMultiplier', 'restMultiplier', 'holidayMultiplier']) form.elements[name].value = '';
  }
  if (event.target.name === 'holidayType') form.elements.holidayMultiplier.value = '';
  update();
});
$('reset').addEventListener('click', () => {
  populate();
  resetHolidayShiftInputs();
  for (const el of form.querySelectorAll('details')) el.open = false;
  $('details').open = false;
  update();
  $('status').textContent = 'Calculator reset to the sample salary.';
});
$('add-holiday-shift').addEventListener('click', () => { addHolidayShift(); update(); });
$('holiday-shift-list').addEventListener('click', event => {
  const button = event.target.closest('.remove-holiday-shift');
  if (!button) return;
  button.closest('.holiday-shift-entry').remove();
  update();
});

for (const link of document.querySelectorAll('.sidebar nav a')) {
  link.addEventListener('click', () => {
    document.querySelector('.sidebar nav [aria-current]')?.removeAttribute('aria-current');
    link.setAttribute('aria-current', 'location');
    $('sidebar').classList.remove('visible');
    $('menu').setAttribute('aria-expanded', 'false');
  });
}
$('menu').addEventListener('click', () => $('menu').setAttribute('aria-expanded', String($('sidebar').classList.toggle('visible'))));
const dialog = $('rules-dialog');
$('settings').addEventListener('click', () => {
  $('rules-json').value = JSON.stringify(rules, null, 2);
  $('rules-error').textContent = '';
  dialog.showModal();
});
$('close-settings').addEventListener('click', () => dialog.close());
$('restore-rules').addEventListener('click', () => {
  $('rules-json').value = JSON.stringify(DEFAULT_RULES, null, 2);
  $('rules-error').textContent = 'Default schedules loaded. Apply settings to use them.';
});
$('save-rules').addEventListener('click', () => {
  try {
    const validated = parseRules($('rules-json').value);
    const serialized = JSON.stringify(validated);
    custom = serialized !== JSON.stringify(DEFAULT_RULES);
    if (custom) localStorage.setItem(storageKey, serialized);
    else localStorage.removeItem(storageKey);
    rules = validated;
    update();
    dialog.close();
    $('status').textContent = custom ? 'Custom schedules applied.' : 'Official default schedules applied.';
    updateScheduleBadge();
  } catch (error) {
    $('rules-error').textContent = `Settings were not applied: ${error.message}`;
  }
});
function updateScheduleBadge() {
  document.querySelector('.schedule-badge').lastChild.textContent = custom ? ' Custom schedules' : ` ${SOURCE_DATE} reference`;
}

function populatePrint() {
  const report = $('print-report');
  report.replaceChildren();
  const add = (parent, tag, content) => {
    const element = document.createElement(tag);
    element.textContent = content;
    parent.append(element);
    return element;
  };
  add(report, 'h1', 'Paycheck PH · Salary Breakdown');
  const table = add(report, 'table', '');
  for (const [label, value] of reportRows(current, custom)) {
    const tr = add(table, 'tr', '');
    add(tr, 'th', label);
    add(tr, 'td', typeof value === 'number' ? peso(value) : value ?? '');
  }
}
window.addEventListener('beforeprint', populatePrint);
$('print').addEventListener('click', () => window.print());
for (const [id, download] of [['pdf', downloadPDF], ['excel', downloadExcel]]) {
  $(id).addEventListener('click', async () => {
    const button = $(id);
    button.disabled = true;
    $('status').textContent = 'Preparing salary breakdown…';
    try {
      await download(current, custom);
      $('status').textContent = 'Salary breakdown downloaded.';
    } catch (error) {
      $('status').textContent = `Could not download the breakdown: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  });
}

populate();
resetHolidayShiftInputs();
update();
updateScheduleBadge();
$('status').textContent = startupError;
