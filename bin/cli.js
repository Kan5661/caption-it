#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const fs = require('fs');
const CaptionIt = require('../src/index.js');

const program = new Command();
const captionIt = new CaptionIt();

program
  .name('caption-it')
  .description('Add captions to videos with different styles')
  .version('1.0.0');

program
  .command('add')
  .description('Add a single caption to video')
  .requiredOption('-i, --input <path>', 'input video file path')
  .requiredOption('-o, --output <path>', 'output video file path')
  .requiredOption('-t, --text <text>', 'caption text')
  .option('-s, --style <style>', 'caption style (gif or tiktok)', 'gif')
  .option('--start <seconds>', 'start time in seconds', '0')
  .option('--duration <seconds>', 'duration in seconds')
  .option('--font <path>', 'path to custom font file')
  .action(async (options) => {
    const spinner = ora('Adding caption to video...').start();

    try {
      const result = await captionIt.addCaption({
        inputPath: options.input,
        outputPath: options.output,
        text: options.text,
        style: options.style,
        startTime: parseFloat(options.start),
        duration: options.duration ? parseFloat(options.duration) : undefined,
        fontfile: options.font
      });

      spinner.succeed(chalk.green(`Caption added successfully! Output: ${result}`));
    } catch (error) {
      spinner.fail(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('add-multiple')
  .description('Add multiple captions with timing from JSON file')
  .requiredOption('-i, --input <path>', 'input video file path')
  .requiredOption('-o, --output <path>', 'output video file path')
  .requiredOption('-c, --captions <path>', 'JSON file with captions data')
  .option('-s, --style <style>', 'caption style (gif or tiktok)', 'gif')
  .option('--font <path>', 'path to custom font file')
  .action(async (options) => {
    const spinner = ora('Adding multiple captions to video...').start();

    try {
      // Read captions from JSON file
      if (!fs.existsSync(options.captions)) {
        throw new Error(`Captions file not found: ${options.captions}`);
      }

      const captionsData = JSON.parse(fs.readFileSync(options.captions, 'utf8'));

      if (!Array.isArray(captionsData)) {
        throw new Error('Captions file must contain an array of caption objects');
      }

      // Validate caption format
      for (const caption of captionsData) {
        if (!caption.text || typeof caption.startTime !== 'number' || typeof caption.endTime !== 'number') {
          throw new Error('Each caption must have text, startTime, and endTime properties');
        }
      }

      const result = await captionIt.addMultipleCaptions({
        inputPath: options.input,
        outputPath: options.output,
        captions: captionsData,
        style: options.style,
        fontfile: options.font
      });

      spinner.succeed(chalk.green(`Multiple captions added successfully! Output: ${result}`));
    } catch (error) {
      spinner.fail(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('styles')
  .description('List available caption styles')
  .action(() => {
    const styles = captionIt.getAvailableStyles();
    console.log(chalk.cyan('Available caption styles:'));

    styles.forEach(style => {
      const config = captionIt.getStyleConfig(style);
      console.log(chalk.yellow(`\n${style}:`));
      console.log(`  Font size: ${config.fontsize}`);
      console.log(`  Font color: ${config.fontcolor}`);
      console.log(`  Position: ${config.x}, ${config.y}`);

      if (style === 'gif') {
        console.log(chalk.gray('  Style: White text with black outline on white background, positioned at top'));
      } else if (style === 'tiktok') {
        console.log(chalk.gray('  Style: White text on black transparent background, centered'));
      }
    });
  });

program
  .command('example')
  .description('Show example usage and caption JSON format')
  .action(() => {
    console.log(chalk.cyan('Example usage:'));
    console.log(chalk.white('\n# Add single caption:'));
    console.log('caption-it add -i input.mp4 -o output.mp4 -t "Hello World!" -s gif');

    console.log(chalk.white('\n# Add multiple captions:'));
    console.log('caption-it add-multiple -i input.mp4 -o output.mp4 -c captions.json -s tiktok');

    console.log(chalk.cyan('\nExample captions.json format:'));
    console.log(JSON.stringify([
      {
        "text": "First caption",
        "startTime": 0,
        "endTime": 3
      },
      {
        "text": "Second caption",
        "startTime": 3,
        "endTime": 6
      },
      {
        "text": "Third caption",
        "startTime": 6,
        "endTime": 9
      }
    ], null, 2));
  });

// Handle unknown commands
program.on('command:*', function (operands) {
  console.error(chalk.red(`Unknown command: ${operands[0]}`));
  console.log(chalk.yellow('Use --help to see available commands'));
  process.exit(1);
});

// Show help if no arguments provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(0);
}

program.parse(process.argv);
