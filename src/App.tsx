import React, { useState, useRef, useEffect } from 'react';
import { 
  Radio, Play, Pause, SkipForward, SkipBack, 
  Mic, MicOff, Volume2, VolumeX, Plus, 
  ListMusic, Settings, Users, Upload
} from 'lucide-react';

interface Track {
  id: string;
  file: File;
  title: string;
  url: string;
}

export default function App() {
  // Playlist & Player State
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [musicVolume, setMusicVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  // Live Input State
  const [micActive, setMicActive] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);

  // Handle File Uploads
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newTracks = Array.from(e.target.files).map((file) => ({
        id: Math.random().toString(36).substring(7),
        file,
        title: file.name.replace(/\.[^/.]+$/, ""), // Remove extension
        url: URL.createObjectURL(file)
      }));
      setQueue(prev => [...prev, ...newTracks]);
    }
  };

  // Player Controls
  const togglePlay = () => {
    if (!audioRef.current || queue.length === 0) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const nextTrack = () => {
    if (currentIndex < queue.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  };

  const prevTrack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setIsPlaying(true);
    }
  };

  // Microphone & Auto-Ducking Logic
  const toggleMic = async () => {
    if (micActive) {
      // Turn off Mic
      if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        setMicStream(null);
      }
      setMicActive(false);
    } else {
      // Turn on Mic
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setMicStream(stream);
        setMicActive(true);
      } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("Não foi possível acessar o microfone.");
      }
    }
  };

  // Apply Auto-Ducking
  useEffect(() => {
    if (audioRef.current) {
      // If mic is active, reduce music volume to 20% (Auto-Ducking)
      audioRef.current.volume = micActive ? musicVolume * 0.2 : musicVolume;
    }
  }, [micActive, musicVolume]);

  // Audio Event Listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => setProgress(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => nextTrack();

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentIndex, queue.length]);

  // Auto-play when track changes
  useEffect(() => {
    if (audioRef.current && isPlaying) {
      audioRef.current.play().catch(console.error);
    }
  }, [currentIndex]);

  const currentTrack = queue[currentIndex];

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-emerald-500/30">
      {/* Hidden Audio Element */}
      <audio 
        ref={audioRef} 
        src={currentTrack?.url} 
      />

      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-colors ${isBroadcasting ? 'bg-red-500 shadow-red-500/20' : 'bg-zinc-800'}`}>
              <Radio className={`w-5 h-5 ${isBroadcasting ? 'text-white animate-pulse' : 'text-zinc-400'}`} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Web Radio Studio</h1>
              <p className="text-xs text-zinc-400 font-medium">Painel do DJ</p>
            </div>
          </div>

          <button
            onClick={() => setIsBroadcasting(!isBroadcasting)}
            className={`px-6 py-2 rounded-full font-bold text-sm tracking-wide transition-all ${
              isBroadcasting 
                ? 'bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500/20' 
                : 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400'
            }`}
          >
            {isBroadcasting ? 'ENCERRAR TRANSMISSÃO' : 'ENTRAR NO AR'}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Playlist Management */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl flex flex-col h-[calc(100vh-12rem)]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ListMusic className="w-5 h-5 text-emerald-500" />
                Fila de Reprodução
              </h2>
              
              <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-zinc-300 p-2 rounded-lg transition-colors">
                <Plus className="w-5 h-5" />
                <input 
                  type="file" 
                  accept="audio/*" 
                  multiple 
                  className="hidden" 
                  onChange={handleFileUpload}
                />
              </label>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {queue.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500 space-y-4">
                  <Upload className="w-12 h-12 opacity-20" />
                  <p>Adicione músicas do seu computador<br/>para começar a programação.</p>
                </div>
              ) : (
                queue.map((track, idx) => (
                  <div 
                    key={track.id}
                    onClick={() => {
                      setCurrentIndex(idx);
                      setIsPlaying(true);
                    }}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
                      idx === currentIndex 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center flex-shrink-0">
                      {idx === currentIndex && isPlaying ? (
                        <div className="flex gap-0.5 items-end h-4">
                          <span className="w-1 bg-emerald-500 h-full animate-[bounce_1s_infinite]"></span>
                          <span className="w-1 bg-emerald-500 h-2/3 animate-[bounce_1s_infinite_0.2s]"></span>
                          <span className="w-1 bg-emerald-500 h-4/5 animate-[bounce_1s_infinite_0.4s]"></span>
                        </div>
                      ) : (
                        <span className="text-xs font-mono opacity-50">{idx + 1}</span>
                      )}
                    </div>
                    <div className="truncate flex-1">
                      <p className="font-medium truncate text-sm">{track.title}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Center & Right Columns: Decks and Live Controls */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Main Deck */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-xl relative overflow-hidden">
            {/* Background glow if playing */}
            {isPlaying && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-emerald-500/5 blur-[100px] pointer-events-none"></div>
            )}
            
            <div className="flex flex-col items-center text-center mb-8 relative z-10">
              <span className="px-3 py-1 rounded-full bg-zinc-800 text-xs font-bold tracking-widest text-zinc-400 mb-6">
                DECK PRINCIPAL
              </span>
              <h2 className="text-3xl font-bold text-white mb-2 truncate w-full px-4">
                {currentTrack ? currentTrack.title : 'Nenhuma faixa selecionada'}
              </h2>
              <p className="text-zinc-500">
                {queue.length > 0 ? `Faixa ${currentIndex + 1} de ${queue.length}` : 'Adicione músicas à fila'}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="mb-8 relative z-10">
              <div className="flex justify-between text-xs font-mono text-zinc-400 mb-2">
                <span>{formatTime(progress)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <div 
                className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden cursor-pointer"
                onClick={(e) => {
                  if (!audioRef.current) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const percentage = x / rect.width;
                  audioRef.current.currentTime = percentage * duration;
                }}
              >
                <div 
                  className="h-full bg-emerald-500 transition-all duration-100 ease-linear"
                  style={{ width: `${(progress / (duration || 1)) * 100}%` }}
                ></div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-6 relative z-10">
              <button 
                onClick={prevTrack}
                className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center hover:bg-zinc-700 transition-colors text-zinc-300"
              >
                <SkipBack className="w-5 h-5" />
              </button>
              
              <button 
                onClick={togglePlay}
                disabled={!currentTrack}
                className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center hover:bg-emerald-400 transition-transform active:scale-95 text-zinc-950 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
              >
                {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
              </button>
              
              <button 
                onClick={nextTrack}
                className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center hover:bg-zinc-700 transition-colors text-zinc-300"
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Mixer & Live Input */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Music Volume Control */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
              <h3 className="text-sm font-bold text-zinc-400 mb-6 flex items-center gap-2">
                <Volume2 className="w-4 h-4" />
                VOLUME DA MÚSICA
              </h3>
              <div className="flex items-center gap-4">
                <VolumeX className="w-5 h-5 text-zinc-600" />
                <input 
                  type="range" 
                  min="0" max="1" step="0.01"
                  value={musicVolume}
                  onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                />
                <Volume2 className="w-5 h-5 text-zinc-400" />
              </div>
              <p className="text-xs text-zinc-500 mt-4 text-center">
                {micActive ? 'Volume reduzido automaticamente (Auto-Ducking)' : 'Volume normal'}
              </p>
            </div>

            {/* Live Mic Control */}
            <div className={`border rounded-2xl p-6 shadow-xl transition-all ${
              micActive 
                ? 'bg-amber-500/10 border-amber-500/30' 
                : 'bg-zinc-900 border-zinc-800'
            }`}>
              <div className="flex items-center justify-between mb-6">
                <h3 className={`text-sm font-bold flex items-center gap-2 ${micActive ? 'text-amber-500' : 'text-zinc-400'}`}>
                  <Mic className="w-4 h-4" />
                  ENTRADA AO VIVO (MIC)
                </h3>
                {micActive && <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                </span>}
              </div>
              
              <button
                onClick={toggleMic}
                className={`w-full py-4 rounded-xl font-bold tracking-wide transition-all flex items-center justify-center gap-2 ${
                  micActive 
                    ? 'bg-amber-500 text-zinc-950 hover:bg-amber-400 shadow-lg shadow-amber-500/20' 
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {micActive ? (
                  <>
                    <MicOff className="w-5 h-5" />
                    DESLIGAR MICROFONE
                  </>
                ) : (
                  <>
                    <Mic className="w-5 h-5" />
                    FALAR AO VIVO
                  </>
                )}
              </button>
              <p className="text-xs text-zinc-500 mt-4 text-center">
                Ao falar, a música diminui suavemente.
              </p>
            </div>

          </div>
        </div>

      </main>
    </div>
  );
}

