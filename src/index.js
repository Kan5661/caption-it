const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");
const tmp = require("tmp");

// ✅ Helper to wrap long text and write to a temp file
function wrapTextToFile(str, maxLen = 30) {
    const words = str.split(" ");
    let line = "";
    let result = "";

    for (const word of words) {
        if ((line + word).length > maxLen) {
            result += line.trim() + "\n";
            line = "";
        }
        line += word + " ";
    }
    result += line.trim();

    const tmpFile = tmp.fileSync({ postfix: ".txt" });
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

            const videoStream = metadata.streams.find(
                (stream) => stream.codec_type === "video",
            );
            if (!videoStream) {
                reject(new Error("No video stream found"));
                return;
            }

            resolve({
                width: videoStream.width,
                height: videoStream.height,
                duration: parseFloat(metadata.format.duration),
            });
        });
    });
}

// Calculate scaled font size based on video resolution
function calculateScaledFontSize(videoWidth, videoHeight, baseStyle) {
    const referenceResolutions = {
        gif: { width: 1920, height: 1080 },
        tiktok: { width: 1080, height: 1920 },
    };

    const reference =
        referenceResolutions[baseStyle] || referenceResolutions.gif;

    if (baseStyle === "tiktok") {
        return 1.0;
    }

    const videoArea = videoWidth * videoHeight;
    const referenceArea = reference.width * reference.height;
    const areaRatio = videoArea / referenceArea;

    let scaleFactor = Math.sqrt(areaRatio);

    // Apply more aggressive scaling for small videos
    const minDimension = Math.min(videoWidth, videoHeight);
    if (minDimension < 700) {
        const smallScaleFactor = Math.pow(minDimension / 700, 1.5);
        scaleFactor *= smallScaleFactor;
    }

    return Math.max(0.3, Math.min(scaleFactor, 3.0));
}

// Calculate wrap length based on video width and font size
function calculateWrapLength(videoWidth, fontSize, padding = 40) {
    const charWidth = fontSize * 0.6;
    const usableWidth = videoWidth - padding * 2;
    const maxCharsPerLine = Math.floor(usableWidth / charWidth);
    return Math.max(15, Math.min(maxCharsPerLine, 80));
}

class CaptionIt {
    constructor() {
        // Base styles with reference font sizes (for 1920x1080 for gif, 1080x1920 for tiktok)
        this.baseStyles = {
            gif: {
                baseFontsize: 124, // Base font size for 1920x1080 (3x bigger)
                fontcolor: "white",
                borderw: 6,
                bordercolor: "black@0.95",
                line_spacing: 30,
                textPadding: 40,
                backgroundColor: "black",
            },
            tiktok: {
                baseFontsize: 48, // Base font size for 1080x1920
                fontcolor: "white",
                borderw: 0,
                bordercolor: "black", // Add default bordercolor even though borderw is 0
                box: 1,
                boxcolor: "black@0.6",
                boxborderw: 10,
                x: "(w-text_w)/2",
                y: "(h-text_h)/2",
                line_spacing: 10,
            },
        };
    }

    // Get scaled style configuration based on video dimensions
    getScaledStyle(styleName, videoWidth, videoHeight) {
        const baseStyle = this.baseStyles[styleName];
        if (!baseStyle) {
            throw new Error(
                `Unknown style: ${styleName}. Available styles: ${Object.keys(this.baseStyles).join(", ")}`,
            );
        }

        const scaleFactor = calculateScaledFontSize(
            videoWidth,
            videoHeight,
            styleName,
        );
        const scaledFontSize = Math.round(baseStyle.baseFontsize * scaleFactor);

        // Create scaled style configuration
        const scaledStyle = {
            ...baseStyle,
            fontsize: scaledFontSize,
            // Scale border width proportionally (but keep it reasonable)
            borderw: Math.max(
                1,
                Math.round(baseStyle.borderw * scaleFactor * 0.7),
            ),
            // Scale line spacing proportionally
            line_spacing: Math.round(
                (baseStyle.line_spacing || 0) * scaleFactor,
            ),
            // Scale text padding for gif style
            textPadding: baseStyle.textPadding
                ? Math.round(baseStyle.textPadding * scaleFactor)
                : undefined,
            // Scale box border width for tiktok style
            boxborderw: baseStyle.boxborderw
                ? Math.max(
                      2,
                      Math.round(baseStyle.boxborderw * scaleFactor * 0.8),
                  )
                : undefined,
        };

        return scaledStyle;
    }

    // Helper method to calculate text height (updated to match wrapTextToFile logic)
    calculateTextHeight(text, wrapLen, styleConfig) {
        const words = text.split(" ");
        let line = "";
        let lineCount = 1; // Start with 1 line

        for (const word of words) {
            if ((line + word).length > wrapLen) {
                lineCount++;
                line = word + " ";
            } else {
                line += word + " ";
            }
        }

        return (
            styleConfig.fontsize * lineCount +
            styleConfig.line_spacing * Math.max(0, lineCount - 1)
        );
    }

    async addCaption(options) {
        const {
            inputPath,
            outputPath,
            text,
            style = "gif",
            startTime = 0,
            duration,
            fontfile,
        } = options;

        if (!fs.existsSync(inputPath)) {
            throw new Error(`Input file does not exist: ${inputPath}`);
        }

        if (!this.baseStyles[style]) {
            throw new Error(
                `Unknown style: ${style}. Available styles: ${Object.keys(this.baseStyles).join(", ")}`,
            );
        }

        // Get video dimensions
        const videoInfo = await getVideoInfo(inputPath);

        // Get scaled style configuration
        const styleConfig = this.getScaledStyle(
            style,
            videoInfo.width,
            videoInfo.height,
        );

        // Calculate wrap length based on video width and scaled font size
        const wrapLen = calculateWrapLength(
            videoInfo.width,
            styleConfig.fontsize,
        );
        const captionFile = wrapTextToFile(text, wrapLen);

        console.log(`Video resolution: ${videoInfo.width}x${videoInfo.height}`);
        console.log(
            `Scaled font size: ${styleConfig.fontsize} (base: ${this.baseStyles[style].baseFontsize})`,
        );
        console.log(`Calculated wrap length: ${wrapLen} characters`);

        if (style === "gif") {
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
                wrapLen,
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
                wrapLen,
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
        wrapLen,
    }) {
        const textHeight = this.calculateTextHeight(text, wrapLen, styleConfig);
        const textAreaHeight = textHeight + styleConfig.textPadding * 2;

        // Better text centering calculation
        // Use FFmpeg's built-in text centering with some adjustments
        const textX = "(w-text_w)/2";

        // Calculate vertical center more accurately
        // The text area starts at y=0 (top of the padded area)
        // We want to center the text within the textAreaHeight
        // Using FFmpeg's text_h variable for more accurate positioning
        const textY = `(${textAreaHeight}-text_h)/2`;

        let videoFilters = [
            // 1. Add padding to top (increase canvas height and move video down)
            `pad=iw:ih+${textAreaHeight}:0:${textAreaHeight}:color=${styleConfig.backgroundColor}`,

            // 2. Add text on the top area with better centering
            `drawtext=textfile='${captionFile}':` +
            `fontsize=${styleConfig.fontsize}:` +
            `fontcolor=${styleConfig.fontcolor}:` +
            `x=${textX}:` +
            `y=${textY}:` +
            `line_spacing=${styleConfig.line_spacing}:` +
            `borderw=${styleConfig.borderw}:` +
            `bordercolor=${styleConfig.bordercolor}` +
            (fontfile && fs.existsSync(fontfile)
            ? `:fontfile='${fontfile}'`
            : ""),
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
                .on("start", (commandLine) => {
                    console.log("FFmpeg command:", commandLine);
                    console.log(
                        `Video dimensions: ${videoInfo.width}x${videoInfo.height}`,
                    );
                    console.log(`Scaled font size: ${styleConfig.fontsize}`);
                    console.log(
                        `Calculated wrap length: ${wrapLen} characters`,
                    );
                    console.log(`Text area height: ${textAreaHeight}`);
                })
                .on("progress", (progress) => {
                    if (progress.percent) {
                        console.log(
                            `Processing: ${Math.round(progress.percent)}% done`,
                        );
                    }
                })
                .on("end", () => {
                    console.log("Caption added successfully!");
                    try {
                        fs.unlinkSync(captionFile);
                    } catch (e) {
                        console.warn(
                            "Could not delete temp caption file:",
                            captionFile,
                        );
                    }
                    resolve(outputPath);
                })
                .on("error", (err) => {
                    console.error("Error adding caption:", err.message);
                    try {
                        fs.unlinkSync(captionFile);
                    } catch (e) {
                        console.warn(
                            "Could not delete temp caption file:",
                            captionFile,
                        );
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
        fontfile,
        videoInfo,
        wrapLen,
    }) {
        let drawTextFilter =
            `drawtext=textfile='${captionFile}':` +
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
                .on("start", (commandLine) => {
                    console.log("FFmpeg command:", commandLine);
                    console.log(
                        `Video dimensions: ${videoInfo.width}x${videoInfo.height}`,
                    );
                    console.log(`Scaled font size: ${styleConfig.fontsize}`);
                })
                .on("progress", (progress) => {
                    if (progress.percent) {
                        console.log(
                            `Processing: ${Math.round(progress.percent)}% done`,
                        );
                    }
                })
                .on("end", () => {
                    console.log("Caption added successfully!");
                    try {
                        fs.unlinkSync(captionFile);
                    } catch (e) {
                        console.warn(
                            "Could not delete temp caption file:",
                            captionFile,
                        );
                    }
                    resolve(outputPath);
                })
                .on("error", (err) => {
                    console.error("Error adding caption:", err.message);
                    try {
                        fs.unlinkSync(captionFile);
                    } catch (e) {
                        console.warn(
                            "Could not delete temp caption file:",
                            captionFile,
                        );
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
            style = "gif",
            fontfile,
        } = options;

        if (!fs.existsSync(inputPath)) {
            throw new Error(`Input file does not exist: ${inputPath}`);
        }

        if (!this.baseStyles[style]) {
            throw new Error(
                `Unknown style: ${style}. Available styles: ${Object.keys(this.baseStyles).join(", ")}`,
            );
        }

        // Get video dimensions
        const videoInfo = await getVideoInfo(inputPath);

        // Get scaled style configuration
        const styleConfig = this.getScaledStyle(
            style,
            videoInfo.width,
            videoInfo.height,
        );

        // Calculate wrap length based on video width and scaled font size
        const wrapLen = calculateWrapLength(
            videoInfo.width,
            styleConfig.fontsize,
        );

        console.log(`Video resolution: ${videoInfo.width}x${videoInfo.height}`);
        console.log(
            `Scaled font size: ${styleConfig.fontsize} (base: ${this.baseStyles[style].baseFontsize})`,
        );
        console.log(`Calculated wrap length: ${wrapLen} characters`);

        if (style === "gif") {
            return this.addMultipleGifStyleCaptions({
                inputPath,
                outputPath,
                captions,
                styleConfig,
                fontfile,
                videoInfo,
                wrapLen,
            });
        } else {
            return this.addMultipleTiktokStyleCaptions({
                inputPath,
                outputPath,
                captions,
                styleConfig,
                fontfile,
                videoInfo,
                wrapLen,
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
        wrapLen,
    }) {
        // Calculate the maximum text height needed across all captions
        const maxTextHeight = Math.max(
            ...captions.map((caption) =>
                this.calculateTextHeight(caption.text, wrapLen, styleConfig),
            ),
        );
        const textAreaHeight = maxTextHeight + styleConfig.textPadding * 2;

        // Create temp files for all captions
        const captionFiles = captions.map((caption) => ({
            ...caption,
            file: wrapTextToFile(caption.text, wrapLen),
        }));

        const textX = "(w-text_w)/2";
        // Use FFmpeg's text_h for better centering
        const textY = `(${textAreaHeight}-text_h)/2`;

        let videoFilters = [
            // 1. Add padding to top
            `pad=iw:ih+${textAreaHeight}:0:${textAreaHeight}:color=${styleConfig.backgroundColor}`,
        ];

        // 2. Add drawtext filters for each caption with enable conditions
        captionFiles.forEach((caption) => {
            const enableCondition = `between(t,${caption.startTime},${caption.endTime})`;

            let drawText =
                `drawtext=textfile='${caption.file}':` +
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
                .on("start", (commandLine) => {
                    console.log("FFmpeg command:", commandLine);
                    console.log(
                        `Video dimensions: ${videoInfo.width}x${videoInfo.height}`,
                    );
                    console.log(`Scaled font size: ${styleConfig.fontsize}`);
                    console.log(
                        `Calculated wrap length: ${wrapLen} characters`,
                    );
                    console.log(`Processing ${captions.length} captions`);
                    console.log(`Text area height: ${textAreaHeight}`);
                })
                .on("progress", (progress) => {
                    if (progress.percent) {
                        console.log(
                            `Processing: ${Math.round(progress.percent)}% done`,
                        );
                    }
                })
                .on("end", () => {
                    console.log("Captions added successfully!");
                    // Clean up temp files
                    captionFiles.forEach((caption) => {
                        try {
                            fs.unlinkSync(caption.file);
                        } catch (e) {
                            console.warn(
                                "Could not delete temp caption file:",
                                caption.file,
                            );
                        }
                    });
                    resolve(outputPath);
                })
                .on("error", (err) => {
                    console.error("Error adding captions:", err.message);
                    // Clean up temp files
                    captionFiles.forEach((caption) => {
                        try {
                            fs.unlinkSync(caption.file);
                        } catch (e) {
                            console.warn(
                                "Could not delete temp caption file:",
                                caption.file,
                            );
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
        wrapLen,
    }) {
        // Create temp files for all captions
        const captionFiles = captions.map((caption) => ({
            ...caption,
            file: wrapTextToFile(caption.text, wrapLen),
        }));

        const drawTextFilters = captionFiles.map((caption) => {
            const enableCondition = `between(t,${caption.startTime},${caption.endTime})`;

            let drawText =
                `drawtext=textfile='${caption.file}':` +
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
                .on("start", (commandLine) => {
                    console.log("FFmpeg command:", commandLine);
                    console.log(
                        `Video dimensions: ${videoInfo.width}x${videoInfo.height}`,
                    );
                    console.log(`Scaled font size: ${styleConfig.fontsize}`);
                    console.log(
                        `Calculated wrap length: ${wrapLen} characters`,
                    );
                    console.log(`Processing ${captions.length} captions`);
                })
                .on("progress", (progress) => {
                    if (progress.percent) {
                        console.log(
                            `Processing: ${Math.round(progress.percent)}% done`,
                        );
                    }
                })
                .on("end", () => {
                    console.log("Captions added successfully!");
                    // Clean up temp files
                    captionFiles.forEach((caption) => {
                        try {
                            fs.unlinkSync(caption.file);
                        } catch (e) {
                            console.warn(
                                "Could not delete temp caption file:",
                                caption.file,
                            );
                        }
                    });
                    resolve(outputPath);
                })
                .on("error", (err) => {
                    console.error("Error adding captions:", err.message);
                    // Clean up temp files
                    captionFiles.forEach((caption) => {
                        try {
                            fs.unlinkSync(caption.file);
                        } catch (e) {
                            console.warn(
                                "Could not delete temp caption file:",
                                caption.file,
                            );
                        }
                    });
                    reject(err);
                })
                .run();
        });
    }

    getAvailableStyles() {
        return Object.keys(this.baseStyles);
    }

    getStyleConfig(styleName, videoWidth = 1920, videoHeight = 1080) {
        return this.getScaledStyle(styleName, videoWidth, videoHeight);
    }

    // New method to get base style configuration (unscaled)
    getBaseStyleConfig(styleName) {
        return this.baseStyles[styleName] || null;
    }
}

module.exports = CaptionIt;
