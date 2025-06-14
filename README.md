# caption-it

A simple to use npm package for adding captions to videos (also works on images) with different styles. Supports both CLI usage and programmatic API.

## Features

- **Multiple Caption Styles**: GIF-style (top overlay) and TikTok-style (center overlay)
- **CLI Interface**: Easy command-line usage
- **Programmatic API**: Use in your Node.js projects
- **Multiple Captions**: Add multiple timed captions to a single video
- **Custom Fonts**: Support for custom font files
- **Progress Tracking**: Real-time progress updates during processing

## Prerequisites

This package requires FFmpeg to be installed on your system:

### Installing FFmpeg

**macOS (using Homebrew):**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

**Windows:**
- Download from https://ffmpeg.org/download.html
- Add to your system PATH

## Installation

```bash
# Install globally for CLI usage
npm install -g caption-it

# Install locally for API usage
npm install caption-it
```

## CLI Usage

### Add Single Caption

```bash
caption-it add -i input.mp4 -o output.mp4 -t "Hello World!" -s gif
```

### Add Multiple Captions

```bash
caption-it add-multiple -i input.mp4 -o output.mp4 -c captions.json -s tiktok
```

### List Available Styles

```bash
caption-it styles
```

### Show Examples

```bash
caption-it example
```

### CLI Options

#### `add` command:
- `-i, --input <path>` - Input video file path (required)
- `-o, --output <path>` - Output video file path (required)
- `-t, --text <text>` - Caption text (required)
- `-s, --style <style>` - Caption style: gif or tiktok (default: gif)
- `--start <seconds>` - Start time in seconds (default: 0)
- `--duration <seconds>` - Duration in seconds (optional)
- `--font <path>` - Path to custom font file (optional)

#### `add-multiple` command:
- `-i, --input <path>` - Input video file path (required)
- `-o, --output <path>` - Output video file path (required)
- `-c, --captions <path>` - JSON file with captions data (required)
- `-s, --style <style>` - Caption style: gif or tiktok (default: gif)
- `--font <path>` - Path to custom font file (optional)

## Captions JSON Format

For multiple captions, create a JSON file with the following format:

```json
[
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
]
```

## API Usage

```javascript
const CaptionIt = require('caption-it');

const captionIt = new CaptionIt();

// Add single caption
async function addSingleCaption() {
  try {
    const result = await captionIt.addCaption({
      inputPath: 'input.mp4',
      outputPath: 'output.mp4',
      text: 'Hello World!',
      style: 'gif',
      startTime: 0, // 0 default
      duration: 5 // full video length by default
    });
    console.log('Caption added:', result);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Add multiple captions
async function addMultipleCaptions() {
  const captions = [
    { text: 'First caption', startTime: 0, endTime: 3 },
    { text: 'Second caption', startTime: 3, endTime: 6 },
    { text: 'Third caption', startTime: 6, endTime: 9 }
  ];

  try {
    const result = await captionIt.addMultipleCaptions({
      inputPath: 'input.mp4',
      outputPath: 'output.mp4',
      captions: captions,
      style: 'tiktok'
    });
    console.log('Captions added:', result);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Get available styles
const styles = captionIt.getAvailableStyles();
console.log('Available styles:', styles);

// Get style configuration
const gifStyle = captionIt.getStyleConfig('gif');
console.log('GIF style config:', gifStyle);
```

## Caption Styles

### GIF Style
- **Position**: Top of video
- **Background**: Black
- **Text**: White text with black outline
- **Use case**: Meme-style captions, similar to GIF captions

### TikTok Style
- **Position**: Center of video
- **Background**: Black semi-transparent box
- **Text**: White text without outline
- **Use case**: Social media style captions, similar to TikTok/Instagram

## API Reference

### `CaptionIt`

#### Methods

##### `addCaption(options)`
Add a single caption to a video.

**Parameters:**
- `options` (Object):
  - `inputPath` (string) - Path to input video
  - `outputPath` (string) - Path to output video
  - `text` (string) - Caption text
  - `style` (string) - Caption style ('gif' or 'tiktok')
  - `startTime` (number, optional) - Start time in seconds (default: 0)
  - `duration` (number, optional) - Duration in seconds
  - `fontfile` (string, optional) - Path to custom font file

**Returns:** Promise that resolves to the output path

##### `addMultipleCaptions(options)`
Add multiple timed captions to a video.

**Parameters:**
- `options` (Object):
  - `inputPath` (string) - Path to input video
  - `outputPath` (string) - Path to output video
  - `captions` (Array) - Array of caption objects with {text, startTime, endTime}
  - `style` (string) - Caption style ('gif' or 'tiktok')
  - `fontfile` (string, optional) - Path to custom font file

**Returns:** Promise that resolves to the output path

##### `getAvailableStyles()`
Get list of available caption styles.

**Returns:** Array of style names

##### `getStyleConfig(styleName)`
Get configuration for a specific style.

**Parameters:**
- `styleName` (string) - Name of the style

**Returns:** Style configuration object or null

## Requirements

- Node.js >= 14.0.0
- FFmpeg installed and accessible in PATH

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Issues

If you encounter any issues or have questions, please file an issue on the [GitHub repository](https://github.com/kan5661/caption-it/issues).
