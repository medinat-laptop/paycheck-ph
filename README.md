# Paycheck PH

A browser-based Philippine salary estimator for private-sector and government employees. Salary inputs stay in the page; only custom statutory settings are saved in browser storage. The app does not require an account or a backend.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```shell
npm ci
npm run dev
npm test
npm run build
```

Open the address printed by Vite. Deploy the production build from `dist` to a static web host.

## Publish on GitHub Pages

1. Push the project to the `main` branch of a GitHub repository. Review the company cutoff rules before making the repository or site public. Do not commit payslips, employee records, or credentials.
2. In the repository, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. A public repository supports Pages on GitHub Free; private repositories require an eligible plan.
3. Open **Actions → Deploy Paycheck PH → Run workflow** on `main`. Future pushes to `main` run it automatically.
4. After the deploy job succeeds, open the URL shown under **Settings → Pages** (typically `https://USERNAME.github.io/REPOSITORY/`).

The workflow runs the tests and publishes only the built `dist` folder. Relative asset paths support both repository project URLs and site-root URLs.

## Payroll rules

The **Sources & assumptions** section links to the SSS, GSIS, PhilHealth, Pag-IBIG, BIR, DOLE, and government premium references. **Statutory settings** lets you update rates and tables locally; the checked-in defaults are in [schedules.js](./src/schedules.js).

- **Working days per month** is the divisor used to calculate the daily rate from monthly basic salary. For attendance-based pay, enter **Days worked this pay period** separately. Basic pay is the daily rate times actual days worked (for example, 10 days at ₱1,500 = ₱15,000). Leave the cutoff field blank for the standard frequency-based calculation. Contribution bases and cutoff allocation are not changed by the attendance field.
- Enter allowances, bonuses, benefits, overtime, and other deductions for the selected cutoff. Enter monthly contribution-basis overrides when the cutoff inputs do not reflect actual monthly covered pay. Employer shares and Employees’ Compensation never reduce take-home pay.
- Private payroll overrides: the employee PhilHealth share is 2.5% of monthly basic pay without a floor or ceiling, and the employee Pag-IBIG share is ₱200 per month when basic pay is positive. Both follow the selected cutoff allocation and can be switched off. Their private employer shares and all government contributions still use the configured statutory schedules. Private SSS continues to use the SSS Circular 2024-006 compensation brackets.
- Open **Calculation details** to compare the matching SSS monthly compensation bracket, salary credit, and regular SSS, MPF, and EC shares with the January 2025 schedule. The contribution table above it shows the amounts applied to the selected cutoff.
- For a private semi-monthly payslip using the company method, enable **Use company cutoff calculation**. Enter actual days worked, including holidays, and the holiday counts, exempt daily allowance, and night premium per eligible hour. Basic pay already includes the holiday work days; the calculator adds 30% for special non-working holidays or 100% for regular holidays (200% total). SSS uses cutoff basic pay plus night and holiday premiums, PhilHealth uses 2.5% of cutoff basic pay, and Pag-IBIG uses 2% of cutoff basic pay up to ₱200. The special holiday premium and verified exempt allowance are excluded from withholding under this payslip method. This is a company-specific estimate, not the general statutory treatment.
- Monthly, semi-monthly, weekly and daily use BIR Annex E. Bi-weekly is an annualized estimate (26 cutoffs), not a separate BIR table. The tool does not reconcile year-to-date withholding.
- Verify exemption eligibility and supply only eligible amounts for de minimis benefits. The combined annual 13th-month and other qualifying benefit limit defaults to ₱90,000; enter the portion already used. Minimum wage status is manually confirmed because eligibility depends on the applicable regional wage order.
- Government night work and overtime require agency approval; verify hours, authorized rates, and annual caps. Private overtime covers hours beyond eight for the listed day types. First-eight-hour holiday and rest-day premiums, double holidays, and mixed night hourly rates are not inferred.
- For special coverage, use the applicable verified settings and bases. Unchecking a contribution excludes it from this estimate; it does not waive statutory obligations.

## Sample validation cases

| Case | Expected result |
|---|---|
| Private, ₱35,000 monthly basic, no adjustments | ₱2,825 employee contributions, ₱1,701.30 withholding, ₱30,473.70 net |
| Government, ₱44,000 monthly basic paid semi-monthly | ₱1,980 GSIS, ₱550 PhilHealth, ₱100 Pag-IBIG, ₱1,478.10 withholding, ₱17,891.90 net per cutoff |
| Four covered private night hours at ₱150/hour and 10% | ₱60.00 night differential |
| SSS monthly compensation of ₱14,750 | ₱15,000 MSC, ₱750 employee share, ₱1,500 employer share plus ₱30 EC |

Run the source-based cases and statutory boundary checks with `npm test`.
