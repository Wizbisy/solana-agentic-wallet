import chalk from 'chalk';

export const logger = {
  info: (msg: string) => console.log(chalk.blue('ℹ'), chalk.white(msg)),
  success: (msg: string) => console.log(chalk.green('✔'), chalk.green(msg)),
  warn: (msg: string) => console.log(chalk.yellow('⚠'), chalk.yellow(msg)),
  error: (msg: string) => console.log(chalk.red('✖'), chalk.red(msg)),
  agent: (agentName: string, msg: string) => 
    console.log(chalk.magenta(`[🤖 ${agentName}]`), chalk.cyan(msg)),
  
  startSpinner: (msg: string) => {
    // Static spinner replacement for CJS compatibility
    console.log(chalk.cyan('⠋'), chalk.white(msg));
    return {
      succeed: (successMsg: string) => console.log(chalk.green('✔'), chalk.green(successMsg)),
      fail: (failMsg: string) => console.log(chalk.red('✖'), chalk.red(failMsg)),
    };
  }
};
