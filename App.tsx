/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { ChangeEvent, useEffect, useState, useRef } from 'react';
import PolaroidCard from './components/polaroidCard.tsx';
import { generateImage } from './service/gemini.ts';
import { createAlbumPage } from './lib/album.ts';
import { motion } from 'framer-motion';
import prompts from '../stats/prompt.ts';

// Pre-defined positions for a scattered look on desktop
const UNIVERSES = ['cyberpunk', 'medieval', 'post_apocalyptic', 'futuristic', 'fantasy', 'underwater'];

const POSITIONS = [
    { top: '5%', left: '10%', rotate: -8 },
    { top: '15%', left: '60%', rotate: 5 },
    { top: '45%', left: '5%', rotate: 3 },
    { top: '2%', left: '35%', rotate: 10 },
    { top: '40%', left: '70%', rotate: -12 },
    { top: '50%', left: '38%', rotate: -3 },
];

const GHOST_POLAROIDS_CONFIG = [
  { initial: { x: "-150%", y: "-100%", rotate: -30 }, transition: { delay: 0.2 } },
  { initial: { x: "150%", y: "-80%", rotate: 25 }, transition: { delay: 0.4 } },
  { initial: { x: "-120%", y: "120%", rotate: 45 }, transition: { delay: 0.6 } },
  { initial: { x: "180%", y: "90%", rotate: -20 }, transition: { delay: 0.8 } },
  { initial: { x: "0%", y: "-200%", rotate: 0 }, transition: { delay: 0.5 } },
  { initial: { x: "100%", y: "150%", rotate: 10 }, transition: { delay: 0.3 } },
];


type ImageStatus = 'pending' | 'done' | 'error';
interface GeneratedImage {
    status: ImageStatus;
    url?: string;
    error?: string;
}

const primaryButtonClasses = "font-permanent-marker text-xl text-center text-black bg-yellow-400 py-3 px-8 rounded-sm transform transition-transform duration-200 hover:scale-105 hover:-rotate-2 hover:bg-yellow-300 shadow-[2px_2px_0px_2px_rgba(0,0,0,0.2)]";
const secondaryButtonClasses = "font-permanent-marker text-xl text-center text-white bg-white/10 backdrop-blur-sm border-2 border-white/80 py-3 px-8 rounded-sm transform transition-transform duration-200 hover:scale-105 hover:rotate-2 hover:bg-white hover:text-black";

const useMediaQuery = (query: string) => {
    const [matches, setMatches] = useState(false);
    useEffect(() => {
        const media = window.matchMedia(query);
        if (media.matches !== matches) {
            setMatches(media.matches);
        }
        const listener = () => setMatches(media.matches);
        window.addEventListener('resize', listener);
        return () => window.removeEventListener('resize', listener);
    }, [matches, query]);
    return matches;
};

function App() {
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isDownloading, setIsDownloading] = useState<boolean>(false);
    const [generatedImages, setGeneratedImages] = useState<Record<string, GeneratedImage>>({});
    const [appState, setAppState] = useState<'idle' | 'image-uploaded' | 'generating' | 'results-shown'>('idle');
    const dragAreaRef = useRef<HTMLDivElement>(null);
    const isMobile = useMediaQuery('(max-width: 768px)');

    const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onloadend = () => {
            setUploadedImage(reader.result as string);
            setAppState('image-uploaded');
            setGeneratedImages({});
        };
        reader.readAsDataURL(file);
      }
    };

    const handleGenerateClick = async () => {
      if (!uploadedImage) return;

      setIsLoading(true);
      setAppState('generating');
      
      const initialImages: Record<string, GeneratedImage> = {};
      UNIVERSES.forEach(universe => {
            initialImages[universe] = { status: 'pending' };
        });
        setGeneratedImages(initialImages);

        const concurrencyLimit = 2;
        const universesQueue = [...UNIVERSES];

        const processUniverse = async (universe: string) => {
            try {
                const prompt = `Transform the uploaded human face into a cinematic alternate-universe version of themselves while keeping key facial features recognizable. Apply environment-specific lighting, materials, and costume design to reflect each world’s atmosphere. Ensure realistic skin texture, accurate facial geometry retention, and dynamic background composition. The universe name is "${prompts[universe]['name']}" and the universe is like "${prompts[universe]['desc']}".The resulting image should look cinematic, expressive, and visually distinct for each world — a unique “alternate self” that could exist in that timeline.`;
                const resultUrl = await generateImage(uploadedImage, prompt);
                setGeneratedImages(prev => ({
                    ...prev,
                    [universe]: { status: 'done', url: resultUrl },
                }));
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
                setGeneratedImages(prev => ({
                    ...prev,
                    [universe]: { status: 'error', error: errorMessage },
                }));
                console.error(`Failed to generate image for ${universe}:`, err);
            }
        };

        const workers = Array(concurrencyLimit).fill(null).map(async () => {
            while (universesQueue.length > 0) {
                const universe = universesQueue.shift();
                if (universe) {
                    await processUniverse(universe);
                }
            }
        });

        await Promise.all(workers);

        setIsLoading(false);
        setAppState('results-shown');
    };

    const handleDownloadIndividualImage = (universe: string) => {
      const image = generatedImages[universe];
      if (image?.status === 'done' && image.url) {
        const link = document.createElement('a');
        link.href = image.url;
        link.download = `past-forward-${universe}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    };

    const handleDownloadAlbum = async () => {
      setIsDownloading(true);
      try {
        const imageData = Object.entries(generatedImages)
          .filter(([, image]) => image.status === 'done' && image.url)
          .reduce((acc, [universe, image]) => {
            acc[universe] = image!.url!;
            return acc;
          }, {} as Record<string, string>);

        if (Object.keys(imageData).length < UNIVERSES.length) {
          alert("Please wait for all images to finish generating before downloading the album.");
          return;
        }

        const albumDataUrl = await createAlbumPage(imageData);

        const link = document.createElement('a');
        link.href = albumDataUrl;
        link.download = 'past-forward-album.jpg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

      } catch (error) {
        console.error("Failed to create or download album:", error);
        alert("Sorry, there was an error creating your album. Please try again.");
      } finally {
        setIsDownloading(false);
      }
    };
    
    const handleReset = () => {
      setUploadedImage(null);
      setGeneratedImages({});
      setAppState('idle');
    };
  

  return (
    <main className="bg-black text-neutral-200 min-h-screen w-full flex flex-col items-center justify-center p-4 pb-24 overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-full bg-grid-white/[0.05]"></div>
      
      <div className="z-10 flex flex-col items-center justify-center w-full h-full flex-1 min-h-0">
        <div className="text-center mb-10">
          <h1 className="text-6xl md:text-8xl font-caveat font-bold text-neutral-100">Multiverse Self</h1>
          <p className="font-permanent-marker text-neutral-300 mt-2 text-xl tracking-wide">See yourself in different universes</p>
        </div>

        {appState === 'idle' && (
          <div className="relative flex flex-col items-center justify-center w-full">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 2, duration: 0.8, type: 'spring' }}
              className="flex flex-col items-center"
            >
                <label htmlFor="file-upload" className="cursor-pointer group transform hover:scale-105 transition-transform duration-300">
                  <PolaroidCard  caption="Click to begin" status="done" />
                </label>
                <input id="file-upload" type="file" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleImageUpload} />
                <p className="mt-8 font-permanent-marker text-neutral-500 text-center max-w-[450px] text-lg">
                    Click the polaroid to upload your photo and start your journey through multiple universes.
                </p>
            </motion.div>
        </div>
        )}

        {appState === 'image-uploaded' && uploadedImage && (
            <div className="flex flex-col items-center gap-6">
              <PolaroidCard 
                imageUrl={uploadedImage} 
                caption="Your Photo" 
                status="done"
              />
              <div className="flex items-center gap-4 mt-4">
                <button onClick={handleReset} className={secondaryButtonClasses}>
                    Different Photo
                </button>
                <button onClick={handleGenerateClick} className={primaryButtonClasses}>
                    Generate
                </button>
              </div>
            </div>
        )}

        {(appState === 'generating' || appState === 'results-shown') && (
          <>
            {isMobile ? (
              <div className="w-full max-w-sm flex-1 overflow-y-auto mt-4 space-y-8 p-4">
                {UNIVERSES.map((universe) => (
                  <div key={universe} className="flex justify-center">
                      <PolaroidCard
                      caption={universe}
                      status={generatedImages[universe]?.status || 'pending'}
                      imageUrl={generatedImages[universe]?.url}
                      error={generatedImages[universe]?.error}
                      onDownload={handleDownloadIndividualImage}
                      isMobile={isMobile}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div ref={dragAreaRef} className="relative w-full max-w-5xl h-[600px] mt-4">
                {UNIVERSES.map((universe, index) => {
                  const { top, left, rotate } = POSITIONS[index];
                  return (
                    <motion.div
                      key={universe}
                      className="absolute cursor-grab active:cursor-grabbing"
                      style={{ top, left }}
                      initial={{ opacity: 0, scale: 0.5, y: 100, rotate: 0 }}
                      animate={{ 
                          opacity: 1, 
                          scale: 1, 
                          y: 0,
                          rotate: `${rotate}deg`,
                      }}
                      transition={{ type: 'spring', stiffness: 100, damping: 20, delay: index * 0.15 }}
                    >
                      <PolaroidCard 
                        dragConstraintsRef={dragAreaRef}
                        caption={universe}
                        status={generatedImages[universe]?.status || 'pending'}
                        imageUrl={generatedImages[universe]?.url}
                        error={generatedImages[universe]?.error}
                        onDownload={handleDownloadIndividualImage}
                        isMobile={isMobile}
                      />
                    </motion.div>
                  );
                })}
              </div>
            )}
            <div className="h-20 mt-4 flex items-center justify-center">
              {appState === 'results-shown' && (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <button 
                    onClick={handleDownloadAlbum} 
                    disabled={isDownloading} 
                    className={`${primaryButtonClasses} disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isDownloading ? 'Creating Album...' : 'Download Album'}
                  </button>
                  <button onClick={handleReset} className={secondaryButtonClasses}>Start Over</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default App;
