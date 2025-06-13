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

// ✅ Helper to get video dimensions
function getVideoInfo(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
      if (!videoStream) {
        reject(new Error('No video stream found'));
        return;
      }

      resolve({
        width: videoStream.width,
        height: videoStream.height,
        duration: parseFloat(metadata.format.duration)
      });
    });
  });
}

// ✅ Calculate wrap length based on video width and font size
function calculateWrapLength(videoWidth, fontSize, padding = 40) {
  // Rough estimate: each character takes about 0.6 * fontSize pixels
  const charWidth = fontSize * 0.6;
  const usableWidth = videoWidth - (padding * 2);
  const maxCharsPerLine = Math.floor(usableWidth / charWidth);

  // Ensure minimum and maximum reasonable values
  return Math.max(15, Math.min(maxCharsPerLine, 80));
}

class CaptionIt {
  constructor() {
    this.styles = {
      gif: {
        fontsize: 64,
        fontcolor: 'black',
        borderw: 6,
        bordercolor: 'white@0.95',
        line_spacing: 30,
        wrapLen: 25,
        textPadding: 40, // Padding around text area
        backgroundColor: 'black' // Background color for text area
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

  // Helper method to calculate text height
  calculateTextHeight(text, wrapLen, styleConfig) {
    const numLines = text.split(/\s+/).reduce((acc, word, i, arr) => {
      const line = (acc.line + ' ' + word).trim();
      if (line.length > wrapLen || i === arr.length - 1) {
        acc.count++;
        acc.line = word;
      } else {
        acc.line = line;
      }
      return acc;
    }, { count: 0, line: '' }).count;

    return (styleConfig.fontsize + (styleConfig.line_spacing || 0)) * numLines;
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

    // Get video dimensions
    const videoInfo = await getVideoInfo(inputPath);

    // Calculate wrap length based on video width
    const wrapLen = calculateWrapLength(videoInfo.width, styleConfig.fontsize);
    const captionFile = wrapTextToFile(text, wrapLen);

    if (style === 'gif') {
      return this.addGifStyleCaption({
        inputPath,
        outputPath,
        text,
        captionFile,
        styleConfig,
        startTime,
        duration,
        fontfile,
        videoInfo,
        wrapLen
      });
    } else {
      return this.addTiktokStyleCaption({
        inputPath,
        outputPath,
        text,
        captionFile,
        styleConfig,
        startTime,
        duration,
        fontfile,
        videoInfo,
        wrapLen
      });
    }
  }

  async addGifStyleCaption({
    inputPath,
    outputPath,
    text,
    captionFile,
    styleConfig,
    startTime,
    duration,
    fontfile,
    videoInfo,
    wrapLen
  }) {
    const textHeight = this.calculateTextHeight(text, wrapLen, styleConfig);
    const textAreaHeight = textHeight + (styleConfig.textPadding * 2);

    // Calculate text position (centered horizontally, vertically centered in text area)
    const textX = '(w-text_w)/2';
    const textY = `${styleConfig.textPadding + (textAreaHeight - textHeight) / 2}`;

    let videoFilters = [
      // 1. Add padding to top (increase canvas height and move video down)
      `pad=iw:ih+${textAreaHeight}:0:${textAreaHeight}:color=${styleConfig.backgroundColor}`,

      // 2. Add text on the top area
      `drawtext=textfile='${captionFile}':` +
      `fontsize=${styleConfig.fontsize}:` +
      `fontcolor=${styleConfig.fontcolor}:` +
      `x=${textX}:` +
      `y=${textY}:` +
      `line_spacing=${styleConfig.line_spacing}:` +
      `borderw=${styleConfig.borderw}:` +
      `bordercolor=${styleConfig.bordercolor}` +
      (fontfile && fs.existsSync(fontfile) ? `:fontfile='${fontfile}'` : '')
    ];

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
          console.log(`Video dimensions: ${videoInfo.width}x${videoInfo.height}`);
          console.log(`Calculated wrap length: ${wrapLen} characters`);
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

  async addTiktokStyleCaption({
    inputPath,
    outputPath,
    text,
    captionFile,
    styleConfig,
    startTime,
    duration,
    fontfile
  }) {
    let drawTextFilter = `drawtext=textfile='${captionFile}':` +
      `fontsize=${styleConfig.fontsize}:` +
      `fontcolor=${styleConfig.fontcolor}:` +
      `x=${styleConfig.x}:` +
      `y=${styleConfig.y}`;

    if (styleConfig.box) {
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

    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .videoFilters([drawTextFilter])
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

    // Get video dimensions
    const videoInfo = await getVideoInfo(inputPath);

    // Calculate wrap length based on video width
    const wrapLen = calculateWrapLength(videoInfo.width, styleConfig.fontsize);

    if (style === 'gif') {
      return this.addMultipleGifStyleCaptions({
        inputPath,
        outputPath,
        captions,
        styleConfig,
        fontfile,
        videoInfo,
        wrapLen
      });
    } else {
      return this.addMultipleTiktokStyleCaptions({
        inputPath,
        outputPath,
        captions,
        styleConfig,
        fontfile,
        videoInfo,
        wrapLen
      });
    }
  }

  async addMultipleGifStyleCaptions({
    inputPath,
    outputPath,
    captions,
    styleConfig,
    fontfile,
    videoInfo,
    wrapLen
  }) {
    // Calculate the maximum text height needed across all captions
    const maxTextHeight = Math.max(...captions.map(caption =>
      this.calculateTextHeight(caption.text, wrapLen, styleConfig)
    ));
    const textAreaHeight = maxTextHeight + (styleConfig.textPadding * 2);

    // Create temp files for all captions
    const captionFiles = captions.map(caption => ({
      ...caption,
      file: wrapTextToFile(caption.text, wrapLen)
    }));

    const textX = '(w-text_w)/2';
    const textY = `${styleConfig.textPadding + (textAreaHeight - maxTextHeight) / 2}`;

    let videoFilters = [
      // 1. Add padding to top
      `pad=iw:ih+${textAreaHeight}:0:${textAreaHeight}:color=${styleConfig.backgroundColor}`
    ];

    // 2. Add drawtext filters for each caption with enable conditions
    captionFiles.forEach((caption) => {
      const enableCondition = `between(t,${caption.startTime},${caption.endTime})`;

      let drawText = `drawtext=textfile='${caption.file}':` +
        `fontsize=${styleConfig.fontsize}:` +
        `fontcolor=${styleConfig.fontcolor}:` +
        `x=${textX}:` +
        `y=${textY}:` +
        `line_spacing=${styleConfig.line_spacing}:` +
        `borderw=${styleConfig.borderw}:` +
        `bordercolor=${styleConfig.bordercolor}:` +
        `enable='${enableCondition}'`;

      if (fontfile && fs.existsSync(fontfile)) {
        drawText += `:fontfile='${fontfile}'`;
      }

      videoFilters.push(drawText);
    });

    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .videoFilters(videoFilters)
        .output(outputPath);

      command
        .on('start', (commandLine) => {
          console.log('FFmpeg command:', commandLine);
          console.log(`Video dimensions: ${videoInfo.width}x${videoInfo.height}`);
          console.log(`Calculated wrap length: ${wrapLen} characters`);
          console.log(`Processing ${captions.length} captions`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`Processing: ${Math.round(progress.percent)}% done`);
          }
        })
        .on('end', () => {
          console.log('Captions added successfully!');
          // Clean up temp files
          captionFiles.forEach(caption => {
            try {
              fs.unlinkSync(caption.file);
            } catch (e) {
              console.warn('Could not delete temp caption file:', caption.file);
            }
          });
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('Error adding captions:', err.message);
          // Clean up temp files
          captionFiles.forEach(caption => {
            try {
              fs.unlinkSync(caption.file);
            } catch (e) {
              console.warn('Could not delete temp caption file:', caption.file);
            }
          });
          reject(err);
        })
        .run();
    });
  }

  async addMultipleTiktokStyleCaptions({
    inputPath,
    outputPath,
    captions,
    styleConfig,
    fontfile,
    videoInfo,
    wrapLen
  }) {
    // Create temp files for all captions
    const captionFiles = captions.map(caption => ({
      ...caption,
      file: wrapTextToFile(caption.text, wrapLen)
    }));

    const drawTextFilters = captionFiles.map((caption) => {
      const enableCondition = `between(t,${caption.startTime},${caption.endTime})`;

      let drawText = `drawtext=textfile='${caption.file}':` +
        `fontsize=${styleConfig.fontsize}:` +
        `fontcolor=${styleConfig.fontcolor}:` +
        `x=${styleConfig.x}:` +
        `y=${styleConfig.y}:` +
        `enable='${enableCondition}'`;

      if (styleConfig.box) {
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

      return drawText;
    });

    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .videoFilters(drawTextFilters)
        .output(outputPath);

      command
        .on('start', (commandLine) => {
          console.log('FFmpeg command:', commandLine);
          console.log(`Video dimensions: ${videoInfo.width}x${videoInfo.height}`);
          console.log(`Calculated wrap length: ${wrapLen} characters`);
          console.log(`Processing ${captions.length} captions`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`Processing: ${Math.round(progress.percent)}% done`);
          }
        })
        .on('end', () => {
          console.log('Captions added successfully!');
          // Clean up temp files
          captionFiles.forEach(caption => {
            try {
              fs.unlinkSync(caption.file);
            } catch (e) {
              console.warn('Could not delete temp caption file:', caption.file);
            }
          });
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('Error adding captions:', err.message);
          // Clean up temp files
          captionFiles.forEach(caption => {
            try {
              fs.unlinkSync(caption.file);
            } catch (e) {
              console.warn('Could not delete temp caption file:', caption.file);
            }
          });
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
