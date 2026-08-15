import { runEvaluation } from '../src/evaluation/v24.mjs';

const runtime = process.env.ROUTER_EVAL_RUNTIME || 'claude';
const report = runEvaluation({ runtime });
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.status === 'passed' ? 0 : 1;
