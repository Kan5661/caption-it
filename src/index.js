const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const tmp = require('tmp');

// ✅ Helper to wrap long text and write to a temp file
function wrapTextToFile(str, maxLen = 30) {
  const words = str.split(' ');
  let line = '';
  let result = '';

  for (const word of words) {
    if ((line + word).length > maxLen) {
      result += line.trim() + '\n';
      line = '';
    }
    line += word + ' ';
  }
  result += line.trim();

  const tmpFile = tmp.fileSync({ postfix: '.txt' });
  fs.writeFileSync(tmpFile.name, result);
  return tmpFile.name;
}

class CaptionIt {
  constructor() {
    this.styles = {
      gif: {
        fontsize: 64,
        fontcolor: 'white',
        borderw: 6,
        bordercolor: 'black@0.8',
        x: '(w-text_w)/2',
        y: '50',
        line_spacing: 30,
        wrapLen: 25
      },
      tiktok: {
        fontsize: 32,
        fontcolor: 'white',
        borderw: 0,
        box: 1,
        boxcolor: 'black@0.6',
        boxborderw: 10,
        x: '(w-text_w)/2',
        y: '(h-text_h)/2',
        line_spacing: 10,
        wrapLen: 45
      }
    };
  }

  async addCaption(options) {
    const {
      inputPath,
      outputPath,
      text,
      style = 'gif',
      startTime = 0,
      duration,
      fontfile
    } = options;

    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file does not exist: ${inputPath}`);
    }

    if (!this.styles[style]) {
      throw new Error(`Unknown style: ${style}. Available styles: ${Object.keys(this.styles).join(', ')}`);
    }

    const styleConfig = this.styles[style];
    const captionFile = wrapTextToFile(text, styleConfig.wrapLen || 30);

    // Estimate number of lines for box height
    const numLines = text.split(/\s+/).reduce((acc, word, i, arr) => {
      const line = (acc.line + ' ' + word).trim();
      if (line.length > (styleConfig.wrapLen || 30) || i === arr.length - 1) {
        acc.count++;
        acc.line = word;
      } else {
        acc.line = line;
      }
      return acc;
    }, { count: 0, line: '' }).count;

    const boxHeight = (styleConfig.fontsize + (styleConfig.line_spacing || 0)) * numLines;

    let videoFilters = [];

    if (style === 'gif') {
      const drawBoxFilter = `drawbox=x=0:y=${styleConfig.y - 40}:w=iw:h=${boxHeight + 80}:color=white:t=fill`;
      videoFilters.push(drawBoxFilter);
    }

    let drawTextFilter = `drawtext=textfile='${captionFile}':` +
      `fontsize=${styleConfig.fontsize}:` +
      `fontcolor=${styleConfig.fontcolor}:` +
      `x=${styleConfig.x}:` +
      `y=${styleConfig.y}`;

    if (style === 'tiktok' && styleConfig.box) {
      drawTextFilter += `:box=1:boxcolor=${styleConfig.boxcolor}:boxborderw=${styleConfig.boxborderw}`;
    }

    if (styleConfig.line_spacing !== undefined) {
      drawTextFilter += `:line_spacing=${styleConfig.line_spacing}`;
    }

    if (styleConfig.borderw > 0) {
      drawTextFilter += `:borderw=${styleConfig.borderw}:bordercolor=${styleConfig.bordercolor}`;
    }

    if (fontfile && fs.existsSync(fontfile)) {
      drawTextFilter += `:fontfile='${fontfile}'`;
    }

    videoFilters.push(drawTextFilter);

    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .videoFilters(videoFilters)
        .output(outputPath);

      if (startTime > 0) {
        command = command.seekInput(startTime);
      }

      if (duration) {
        command = command.duration(duration);
      }

      command
        .on('start', (commandLine) => {
          console.log('FFmpeg command:', commandLine);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`Processing: ${Math.round(progress.percent)}% done`);
          }
        })
        .on('end', () => {
          console.log('Caption added successfully!');
          try {
            fs.unlinkSync(captionFile);
          } catch (e) {
            console.warn('Could not delete temp caption file:', captionFile);
          }
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('Error adding caption:', err.message);
          try {
            fs.unlinkSync(captionFile);
          } catch (e) {
            console.warn('Could not delete temp caption file:', captionFile);
          }
          reject(err);
        })
        .run();
    });
  }

  async addMultipleCaptions(options) {
    const {
      inputPath,
      outputPath,
      captions,
      style = 'gif',
      fontfile
    } = options;

    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file does not exist: ${inputPath}`);
    }

    if (!this.styles[style]) {
      throw new Error(`Unknown style: ${style}. Available styles: ${Object.keys(this.styles).join(', ')}`);
    }

    const styleConfig = this.styles[style];

    const drawTextFilters = captions.flatMap((caption) => {
      const enableCondition = `between(t,${caption.startTime},${caption.endTime})`;
      const captionFile = wrapTextToFile(caption.text, styleConfig.wrapLen || 30);

      const numLines = caption.text.split(/\s+/).reduce((acc, word, i, arr) => {
        const line = (acc.line + ' ' + word).trim();
        if (line.length > (styleConfig.wrapLen || 30) || i === arr.length - 1) {
          acc.count++;
          acc.line = word;
        } else {
          acc.line = line;
        }
        return acc;
      }, { count: 0, line: '' }).count;

      const boxHeight = (styleConfig.fontsize + (styleConfig.line_spacing || 0)) * numLines;

      let filters = [];

      if (style === 'gif') {
        const drawBox = `drawbox=x=0:y=${styleConfig.y - 40}:w=iw:h=${boxHeight + 80}:color=white@0.9:t=fill:enable='${enableCondition}'`;
        filters.push(drawBox);
      }

      let drawText = `drawtext=textfile='${captionFile}':` +
        `fontsize=${styleConfig.fontsize}:` +
        `fontcolor=${styleConfig.fontcolor}:` +
        `x=${styleConfig.x}:` +
        `y=${styleConfig.y}:` +
        `enable='${enableCondition}'`;

      if (style === 'tiktok' && styleConfig.box) {
        drawText += `:box=1:boxcolor=${styleConfig.boxcolor}:boxborderw=${styleConfig.boxborderw}`;
      }

      if (styleConfig.line_spacing !== undefined) {
        drawText += `:line_spacing=${styleConfig.line_spacing}`;
      }

      if (styleConfig.borderw > 0) {
        drawText += `:borderw=${styleConfig.borderw}:bordercolor=${styleConfig.bordercolor}`;
      }

      if (fontfile && fs.existsSync(fontfile)) {
        drawText += `:fontfile='${fontfile}'`;
      }

      filters.push(drawText);
      return filters;
    });

    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .videoFilters(drawTextFilters)
        .output(outputPath);

      command
        .on('start', (commandLine) => {
          console.log('FFmpeg command:', commandLine);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`Processing: ${Math.round(progress.percent)}% done`);
          }
        })
        .on('end', () => {
          console.log('Captions added successfully!');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('Error adding captions:', err.message);
          reject(err);
        })
        .run();
    });
  }

  getAvailableStyles() {
    return Object.keys(this.styles);
  }

  getStyleConfig(styleName) {
    return this.styles[styleName] || null;
  }
}

module.exports = CaptionIt;
