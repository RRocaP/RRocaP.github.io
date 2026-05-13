
class ProteinVisualization {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private loadingOverlay: HTMLElement | null;
  private frameCount: number;
  private currentFrame: number;
  private targetFrame: number;
  private frames: HTMLImageElement[];
  private loadedFrames: number;
  private frameBasePath: string;
  private frameFormat: string;
  private scrollSensitivity: number;
  private smoothingFactor: number;
  private devicePixelRatio: number;

  constructor() {
    this.canvas = document.getElementById('protein-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.loadingOverlay = document.getElementById('loading-overlay');
    
    // Configuration
    this.frameCount = 180; // Total number of frames (180 degrees rotation)
    this.currentFrame = 0;
    this.targetFrame = 0;
    this.frames = [];
    this.loadedFrames = 0;
    
    // Video/Image sequence configuration
    // In production, these would be actual video frames or image sequences
    this.frameBasePath = `${import.meta.env.BASE_URL}assets/protein-frames/`; // Path to frame images
    this.frameFormat = '.webp'; // Using WebP for better compression
    
    // Scroll configuration
    this.scrollSensitivity = 0.5;
    this.smoothingFactor = 0.1; // For smooth frame interpolation
    
    // Canvas sizing
    this.devicePixelRatio = window.devicePixelRatio || 1;
    
    this.init();
  }
  
  async init() {
    // Set canvas size
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    
    // Start loading frames
    await this.loadFrames();
    
    // Set up scroll listener
    this.setupScrollListener();
    
    // Start animation loop
    this.animate();
  }
  
  resizeCanvas = () => {
    const container = this.canvas.parentElement;
    const rect = container.getBoundingClientRect();
    
    // Set display size
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    
    // Set actual size in memory (scaled for retina displays)
    this.canvas.width = rect.width * this.devicePixelRatio;
    this.canvas.height = rect.height * this.devicePixelRatio;
    
    // Scale context to ensure correct drawing operations
    this.ctx.scale(this.devicePixelRatio, this.devicePixelRatio);
  }
  
  loadFrames = async () => {
    // Create frame loading promises
    const framePromises = [];
    
    for (let i = 0; i < this.frameCount; i++) {
      const frameNumber = String(i).padStart(4, '0');
      const framePath = `${this.frameBasePath}frame_${frameNumber}${this.frameFormat}`;
      
      framePromises.push(this.loadFrame(framePath, i));
    }
    
    // Load all frames
    try {
      await Promise.all(framePromises);
      this.hideLoading();
    } catch (error) {
      // Error loading frames, fallback to synthetic
      // Fallback to generating synthetic frames
      this.generateSyntheticFrames();
      this.hideLoading();
    }
  }
  
  loadFrame = (src: string, index: number) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.frames[index] = img;
        this.loadedFrames++;
        
        // Update loading progress
        const progress = (this.loadedFrames / this.frameCount) * 100;
        this.updateLoadingProgress(progress);
        
        resolve(img);
      };
      img.onerror = () => reject(new Error(`Failed to load frame: ${src}`));
      img.src = src;
    });
  }
  
  // Fallback: Generate synthetic frames using canvas drawing
  generateSyntheticFrames() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 800;
    tempCanvas.height = 600;
    const tempCtx = tempCanvas.getContext('2d');
    
    if (!tempCtx) {
      // Failed to get 2D context
      return;
    }

    for (let i = 0; i < this.frameCount; i++) {
      // Clear canvas
      tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
      
      // Calculate rotation angle
      const angle = (i / this.frameCount) * Math.PI * 2;
      
      // Draw synthetic protein structure (simplified helix representation)
      this.drawSyntheticProtein(tempCtx, angle, tempCanvas.width / 2, tempCanvas.height / 2);
      
      // Convert canvas to image
      const img = new Image();
      img.src = tempCanvas.toDataURL();
      this.frames[i] = img;
    }
  }
  
  drawSyntheticProtein(ctx: CanvasRenderingContext2D, angle: number, centerX: number, centerY: number) {
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);
    
    // Draw helix-like structure
    const helixRadius = 100;
    const helixHeight = 200;
    const turns = 3;
    const pointsPerTurn = 20;
    const totalPoints = turns * pointsPerTurn;
    
    ctx.strokeStyle = '#DA291C';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    for (let i = 0; i <= totalPoints; i++) {
      const t = i / totalPoints;
      const theta = t * turns * 2 * Math.PI;
      const x = Math.cos(theta) * helixRadius;
      const y = (t - 0.5) * helixHeight;
      const z = Math.sin(theta) * helixRadius;
      
      // Simple 3D to 2D projection
      const scale = 1 + z / 200;
      const projX = x * scale;
      const projY = y * scale;
      
      if (i === 0) {
        ctx.moveTo(projX, projY);
      } else {
        ctx.lineTo(projX, projY);
      }
    }
    
    ctx.stroke();
    
    // Draw some spheres to represent atoms
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      const theta = t * turns * 2 * Math.PI;
      const x = Math.cos(theta) * helixRadius;
      const y = (t - 0.5) * helixHeight;
      const z = Math.sin(theta) * helixRadius;
      
      const scale = 1 + z / 200;
      const projX = x * scale;
      const projY = y * scale;
      const radius = 8 * scale;
      
      ctx.fillStyle = z > 0 ? '#FFD93D' : '#DA291C';
      ctx.beginPath();
      ctx.arc(projX, projY, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
  
  updateLoadingProgress = (progress: number) => {
    if (this.loadingOverlay) {
      const loadingText = this.loadingOverlay.querySelector('.loading-text');
      if (loadingText) {
        loadingText.textContent = `Loading protein structure... ${Math.round(progress)}%`;
      }
    }
  }
  
  hideLoading = () => {
    if (this.loadingOverlay) {
      this.loadingOverlay.style.opacity = '0';
      setTimeout(() => {
        if (this.loadingOverlay) {
          this.loadingOverlay.style.display = 'none';
        }
      }, 300);
    }
  }
  
  setupScrollListener = () => {
    let lastScrollY = window.scrollY;
    let scrollVelocity = 0;
    
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const deltaY = scrollY - lastScrollY;
      
      // Calculate scroll velocity for momentum
      scrollVelocity = deltaY * this.scrollSensitivity;
      
      // Update target frame based on scroll
      this.targetFrame += scrollVelocity;
      
      // Clamp target frame
      this.targetFrame = Math.max(0, Math.min(this.frameCount - 1, this.targetFrame));
      
      lastScrollY = scrollY;
    };
    
    // Throttle scroll events for performance
    let scrollTimeout: number | undefined;
    window.addEventListener('scroll', () => {
      if (scrollTimeout) return;
      
      scrollTimeout = window.setTimeout(() => {
        handleScroll();
        scrollTimeout = undefined;
      }, 16); // ~60fps
    });
    
    // Also handle wheel events for more precise control
    this.canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      this.targetFrame += e.deltaY * 0.1;
      this.targetFrame = Math.max(0, Math.min(this.frameCount - 1, this.targetFrame));
    });
  }
  
  animate = () => {
    // Smooth interpolation between current and target frame
    this.currentFrame += (this.targetFrame - this.currentFrame) * this.smoothingFactor;
    
    // Get the frame to display
    const frameIndex = Math.round(this.currentFrame) % this.frameCount;
    const frame = this.frames[frameIndex];
    
    if (frame && frame.complete) {
      // Clear canvas
      const displayWidth = parseFloat(this.canvas.style.width.replace('px', ''));
      const displayHeight = parseFloat(this.canvas.style.height.replace('px', ''));
      this.ctx.clearRect(0, 0, displayWidth, displayHeight);
      
      // Calculate aspect ratio preserving dimensions
      const scale = Math.min(
        displayWidth / frame.width,
        displayHeight / frame.height
      );
      
      const x = (displayWidth - frame.width * scale) / 2;
      const y = (displayHeight - frame.height * scale) / 2;
      
      // Draw frame
      this.ctx.drawImage(
        frame,
        x, y,
        frame.width * scale,
        frame.height * scale
      );
    }
    
    // Continue animation loop
    requestAnimationFrame(() => this.animate());
  }
}

export default ProteinVisualization;
