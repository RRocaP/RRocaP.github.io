# Protein Visualization Component

A Latent Labs-style protein visualization component that uses pre-rendered video frames with scroll-controlled playback for smooth 3D protein structure animations.

## Features

- **Canvas-based rendering**: High-performance frame rendering using HTML5 Canvas
- **Scroll-controlled playback**: Intuitive scroll-based rotation control
- **Smooth frame interpolation**: Seamless transitions between frames
- **Responsive design**: Adapts to different screen sizes
- **Fallback rendering**: Synthetic protein generation when frames are unavailable
- **Dark mode support**: Automatically adapts to system theme

## Usage

### Astro Component

```astro
---
import ProteinVisualization from './components/ProteinVisualization.astro';
---

<ProteinVisualization />
```

### React Component

```tsx
import { ProteinVisualizationReact } from './components/ProteinVisualizationReact';

const structureData = {
  name: 'Custom Protein',
  description: 'Description of your protein',
  pdbId: '1ABC',
  frameCount: 180
};

const config = {
  frameBasePath: '/assets/custom-frames/',
  scrollSensitivity: 0.3
};

<ProteinVisualizationReact 
  structureData={structureData}
  config={config}
/>
```

## Frame Generation

To generate frames for your protein structure:

1. Install dependencies:
```bash
npm install canvas node-fetch
```

2. Run the frame generator:
```bash
node src/utils/generateProteinFrames.js \
  --pdb 2K6O \
  --frames 180 \
  --output ./public/assets/protein-frames/ \
  --format webp \
  --quality 85
```

### Generator Options

- `--pdb`: PDB ID of the protein structure
- `--frames`: Number of frames to generate (default: 180)
- `--output`: Output directory for frames
- `--width`: Frame width in pixels (default: 800)
- `--height`: Frame height in pixels (default: 600)
- `--format`: Image format (webp, png, jpg)
- `--quality`: Image quality 1-100 (for webp/jpg)

## Configuration

### ProteinVisualizationConfig

```typescript
{
  frameCount: 180,           // Total number of frames
  frameBasePath: '/path/',   // Path to frame images
  frameFormat: '.webp',      // Image format
  scrollSensitivity: 0.5,    // Scroll speed multiplier
  smoothingFactor: 0.1       // Frame interpolation smoothness
}
```

### ProteinStructureData

```typescript
{
  name: 'Protein Name',
  description: 'Protein description',
  pdbId: '2K6O',            // Optional PDB identifier
  frameCount: 180,          // Number of frames
  defaultRotation: 0        // Starting rotation angle
}
```

## Styling

The component includes default styles that integrate with your design system. Key CSS variables used:

- `--background`: Main background color
- `--background-alt`: Alternative background color
- `--primary`: Primary text color
- `--secondary`: Secondary text color
- `--border`: Border color
- `--accent-red`: Red accent color
- `--space-*`: Spacing variables

## Performance Optimization

1. **Frame Preloading**: All frames are loaded before animation starts
2. **Canvas Optimization**: Uses device pixel ratio for crisp rendering
3. **Throttled Scroll**: Scroll events are throttled to 60fps
4. **Efficient Rendering**: Only redraws when frame changes

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (iOS 15+)
- Mobile: Touch scroll supported

## Troubleshooting

### Frames not loading
- Check frame path configuration
- Verify frame files exist in public directory
- Check browser console for 404 errors

### Jerky animation
- Increase `smoothingFactor` for smoother interpolation
- Ensure frames are properly optimized
- Check for performance bottlenecks in DevTools

### Mobile performance
- Consider reducing frame count for mobile
- Use lower resolution frames
- Enable hardware acceleration

## Examples

### Antimicrobial Peptide Display
```astro
<ProteinVisualization />
<!-- Uses default LL-37 structure -->
```

### Custom Protein with Configuration
```tsx
const myProtein = {
  name: 'EGFR Kinase Domain',
  description: 'Epidermal growth factor receptor tyrosine kinase',
  pdbId: '2ITY',
  frameCount: 360
};

<ProteinVisualizationReact 
  structureData={myProtein}
  config={{ scrollSensitivity: 0.3 }}
/>
```

## Future Enhancements

- [ ] WebGL rendering for better performance
- [ ] Multi-protein comparison view
- [ ] Interactive hotspot annotations
- [ ] VR/AR support
- [ ] Real-time structure manipulation