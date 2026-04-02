import React, { useState, useRef, useEffect } from 'react';
import { 
  Radio, Play, Pause, SkipForward, SkipBack, 
  Mic, MicOff, Volume2, VolumeX, Plus, 
  ListMusic, Upload, Shuffle, ArrowUp, ArrowDown,
  MonitorUp, Clock, Layers, PlayCircle, StopCircle
} from 'lucide-react';

interface Track {
  id: string;
  file?: File;
  title: string;
  url: string;
}

interface Program {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  type: 'live' | 'playlist';
  startJingleId?: string;
  endJingleId?: string;
}

export default function App() {
  // --- State ---
  const [activeTab, setActiveTab] = useState<'playlist' | 'jingles' | 'programs'>('playlist');
  
  // Playlist
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [crossfadeTime, setCrossfadeTime] = useState(3);
  
  // Jingles (Vinhetas)
  const [jingles, setJingles] = useState<Track[]>([]);
  const [autoJingleInterval, setAutoJingleInterval] = useState(3); // Play jingle every X tracks
  const [tracksPlayed, setTracksPlayed] = useState(0);
  const [isJinglePlaying, setIsJinglePlaying] = useState(false);
  const [currentJingleIndex, setCurrentJingleIndex] = useState(-1);

  const [selectedJingleId, setSelectedJingleId] = useState<string>('');

  // Programs
  const [programs, setPrograms] = useState<Program[]>([]);

  // Audio & Live
  const [masterVolume, setMasterVolume] = useState(1);
  const [liveFader, setLiveFader] = useState(0); // 0 = 100% Playlist, 100 = 100% Live PC
  const [micActive, setMicActive] = useState(false);
  const [pcLiveActive, setPcLiveActive] = useState(false);
  
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  // --- Refs ---
  const audio1Ref = useRef<HTMLAudioElement>(null);
  const audio2Ref = useRef<HTMLAudioElement>(null);
  const jingleAudioRef = useRef<HTMLAudioElement>(null);
  const liveAudioRef = useRef<HTMLAudioElement>(null);
  
  const activeAudioRef = useRef<1 | 2>(1);
  const crossfadeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isCrossfadingRef = useRef(false);
  const pcStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const jingleActionRef = useRef<'resume' | 'next'>('resume');
  const isJingleTransitioningRef = useRef(false);

  // Mutable refs for callbacks
  const stateRef = useRef({
    queue, currentIndex, isShuffle, crossfadeTime, 
    jingles, autoJingleInterval, tracksPlayed, isJinglePlaying,
    masterVolume, liveFader, micActive, pcLiveActive
  });

  useEffect(() => {
    stateRef.current = {
      queue, currentIndex, isShuffle, crossfadeTime, 
      jingles, autoJingleInterval, tracksPlayed, isJinglePlaying,
      masterVolume, liveFader, micActive, pcLiveActive
    };
  }, [queue, currentIndex, isShuffle, crossfadeTime, jingles, autoJingleInterval, tracksPlayed, isJinglePlaying, masterVolume, liveFader, micActive, pcLiveActive]);

  // --- Volume Management ---
  useEffect(() => {
    const s = stateRef.current;
    const playlistVol = s.masterVolume * ((100 - s.liveFader) / 100);
    const liveVol = s.masterVolume * (s.liveFader / 100);
    
    // Auto-ducking if mic is active
    const duckedPlaylistVol = s.micActive ? playlistVol * 0.2 : playlistVol;
    
    if (audio1Ref.current && !isCrossfadingRef.current) audio1Ref.current.volume = duckedPlaylistVol;
    if (audio2Ref.current && !isCrossfadingRef.current) audio2Ref.current.volume = duckedPlaylistVol;
    if (jingleAudioRef.current) jingleAudioRef.current.volume = s.masterVolume; // Jingles bypass fader
    if (liveAudioRef.current) liveAudioRef.current.volume = liveVol;
  }, [masterVolume, liveFader, micActive]);

  // --- File Uploads ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'track' | 'jingle') => {
    if (e.target.files) {
      const newItems = Array.from(e.target.files).map((file) => ({
        id: Math.random().toString(36).substring(7),
        file,
        title: file.name.replace(/\.[^/.]+$/, ""),
        url: URL.createObjectURL(file)
      }));
      
      if (type === 'track') {
        setQueue(prev => [...prev, ...newItems]);
        if (queue.length === 0 && newItems.length > 0) {
          setTimeout(() => { setIsPlaying(true); playTrack(0, false); }, 100);
        }
      } else {
        setJingles(prev => [...prev, ...newItems]);
      }
    }
  };

  // --- Playback Logic ---
  const getNextIndex = () => {
    const q = stateRef.current.queue;
    if (q.length === 0) return -1;
    if (stateRef.current.isShuffle) return Math.floor(Math.random() * q.length);
    return (stateRef.current.currentIndex + 1) % q.length;
  };

  const playTrack = (index: number, crossfade = false) => {
    const s = stateRef.current;
    if (s.isJinglePlaying) return; // Don't start track if jingle is playing
    
    const track = s.queue[index];
    if (!track) return;
    
    const currentAudio = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
    const nextAudio = activeAudioRef.current === 1 ? audio2Ref.current : audio1Ref.current;
    if (!currentAudio || !nextAudio) return;

    const targetVol = s.masterVolume * ((100 - s.liveFader) / 100);
    const finalVol = s.micActive ? targetVol * 0.2 : targetVol;

    if (crossfade && s.crossfadeTime > 0) {
      isCrossfadingRef.current = true;
      nextAudio.src = track.url;
      nextAudio.volume = 0;
      nextAudio.play().catch(console.error);
      
      const steps = 20;
      const stepTime = (s.crossfadeTime * 1000) / steps;
      let currentStep = 0;
      
      if (crossfadeIntervalRef.current) clearInterval(crossfadeIntervalRef.current);
      
      crossfadeIntervalRef.current = setInterval(() => {
        currentStep++;
        const ratio = currentStep / steps;
        currentAudio.volume = Math.max(0, finalVol * (1 - ratio));
        nextAudio.volume = Math.min(finalVol, finalVol * ratio);
        
        if (currentStep >= steps) {
          clearInterval(crossfadeIntervalRef.current!);
          currentAudio.pause();
          activeAudioRef.current = activeAudioRef.current === 1 ? 2 : 1;
          isCrossfadingRef.current = false;
        }
      }, stepTime);
    } else {
      if (crossfadeIntervalRef.current) clearInterval(crossfadeIntervalRef.current);
      isCrossfadingRef.current = false;
      currentAudio.pause();
      nextAudio.pause();
      currentAudio.src = track.url;
      currentAudio.volume = finalVol;
      currentAudio.play().catch(console.error);
    }
    setCurrentIndex(index);
    setIsPlaying(true);
  };

  const playJingle = (index: number, action: 'resume' | 'next' = 'resume') => {
    const s = stateRef.current;
    const jingle = s.jingles[index];
    if (!jingle || !jingleAudioRef.current) return;

    // Pause main audio
    const currentAudio = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
    if (currentAudio) currentAudio.pause();
    
    jingleActionRef.current = action;
    setIsJinglePlaying(true);
    setCurrentJingleIndex(index);
    isJingleTransitioningRef.current = false;
    
    jingleAudioRef.current.src = jingle.url;
    jingleAudioRef.current.volume = s.masterVolume;
    jingleAudioRef.current.play().catch(console.error);
  };

  const handleJingleTimeUpdate = () => {
    const s = stateRef.current;
    if (!jingleAudioRef.current || !s.isJinglePlaying) return;

    const remaining = jingleAudioRef.current.duration - jingleAudioRef.current.currentTime;
    
    if (remaining <= s.crossfadeTime && remaining > 0 && !isJingleTransitioningRef.current) {
      isJingleTransitioningRef.current = true;
      
      if (jingleActionRef.current === 'next') {
        if (s.queue.length > 0) {
          const nextIdx = getNextIndex();
          if (nextIdx !== -1) {
            setIsJinglePlaying(false);
            playTrack(nextIdx, true);
          }
        }
      } else {
        // Resume current track
        const currentAudio = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
        if (s.isPlaying && currentAudio) {
          setIsJinglePlaying(false);
          currentAudio.play().catch(console.error);
        }
      }
    }
  };

  const handleJingleEnded = () => {
    if (!isJingleTransitioningRef.current) {
      setIsJinglePlaying(false);
      setCurrentJingleIndex(-1);
      setTracksPlayed(0);
      
      const s = stateRef.current;
      
      if (jingleActionRef.current === 'next') {
        if (s.queue.length > 0) {
          const nextIdx = getNextIndex();
          if (nextIdx !== -1) playTrack(nextIdx, true);
        }
      } else {
        // Resume current track
        const currentAudio = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
        if (s.isPlaying && currentAudio) {
          currentAudio.play().catch(console.error);
        }
      }
    } else {
      setCurrentJingleIndex(-1);
      setTracksPlayed(0);
    }
  };

  const handleTimeUpdate = () => {
    const s = stateRef.current;
    if (s.isJinglePlaying) return;

    const currentAudio = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
    if (!currentAudio) return;
    
    setProgress(currentAudio.currentTime);
    setDuration(currentAudio.duration || 0);
    
    const remaining = currentAudio.duration - currentAudio.currentTime;
    if (remaining <= s.crossfadeTime && !isCrossfadingRef.current && remaining > 0 && currentAudio.duration > 0) {
      // Track is ending
      const newTracksPlayed = s.tracksPlayed + 1;
      setTracksPlayed(newTracksPlayed);
      
      // Check if we should play a jingle
      if (s.jingles.length > 0 && s.autoJingleInterval > 0 && newTracksPlayed >= s.autoJingleInterval) {
        // Play a random jingle
        const randomJingleIdx = Math.floor(Math.random() * s.jingles.length);
        playJingle(randomJingleIdx, 'next');
      } else {
        // Normal crossfade to next track
        const nextIdx = getNextIndex();
        if (nextIdx !== -1) playTrack(nextIdx, true);
      }
    }
  };

  // --- Controls ---
  const togglePlay = () => {
    const currentAudio = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
    if (!currentAudio) return;
    
    if (isPlaying) {
      currentAudio.pause();
      setIsPlaying(false);
    } else {
      if (currentIndex === -1 && queue.length > 0) {
        playTrack(0, false);
      } else {
        currentAudio.play().catch(console.error);
        setIsPlaying(true);
      }
    }
  };

  const nextTrack = () => {
    const nextIdx = getNextIndex();
    if (nextIdx !== -1) playTrack(nextIdx, true);
  };

  const prevTrack = () => {
    if (queue.length === 0) return;
    let prevIdx = currentIndex - 1;
    if (prevIdx < 0) prevIdx = queue.length - 1;
    playTrack(prevIdx, true);
  };

  // --- Live PC Audio & Mic ---
  const togglePcLive = async () => {
    if (pcLiveActive) {
      if (pcStreamRef.current) {
        pcStreamRef.current.getTracks().forEach(t => t.stop());
        pcStreamRef.current = null;
      }
      if (liveAudioRef.current) liveAudioRef.current.srcObject = null;
      setPcLiveActive(false);
      setLiveFader(0); // Auto return to playlist
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
        // We only want audio
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          const audioStream = new MediaStream([audioTracks[0]]);
          pcStreamRef.current = audioStream;
          if (liveAudioRef.current) {
            liveAudioRef.current.srcObject = audioStream;
            liveAudioRef.current.play().catch(console.error);
          }
          setPcLiveActive(true);
          setLiveFader(100); // Auto fade to live
        } else {
          alert("Nenhum áudio detectado na captura de tela.");
          stream.getTracks().forEach(t => t.stop());
        }
      } catch (err) {
        console.error("Error accessing PC audio:", err);
      }
    }
  };

  const toggleMic = async () => {
    if (micActive) {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
      }
      setMicActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        // We don't play the mic back to the user to avoid feedback, 
        // but in a real broadcasting app, this stream would be sent to the Icecast/Shoutcast server.
        setMicActive(true);
      } catch (err) {
        console.error("Error accessing microphone:", err);
      }
    }
  };

  // --- Programs Management ---
  const addProgram = () => {
    const newProg: Program = {
      id: Math.random().toString(36).substring(7),
      name: 'Novo Programa',
      startTime: '12:00',
      endTime: '14:00',
      type: 'live'
    };
    setPrograms([...programs, newProg]);
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-emerald-500/30 flex flex-col">
      {/* Hidden Audio Elements */}
      <audio ref={audio1Ref} onTimeUpdate={handleTimeUpdate} />
      <audio ref={audio2Ref} onTimeUpdate={handleTimeUpdate} />
      <audio ref={jingleAudioRef} onTimeUpdate={handleJingleTimeUpdate} onEnded={handleJingleEnded} />
      <audio ref={liveAudioRef} />

      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Radio className="w-5 h-5 text-zinc-950" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Web Radio Pro</h1>
              <p className="text-xs text-emerald-400 font-medium">Studio Manager</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-zinc-800 px-3 py-1.5 rounded-lg">
              <Volume2 className="w-4 h-4 text-zinc-400" />
              <input 
                type="range" min="0" max="1" step="0.01" value={masterVolume}
                onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                className="w-24 accent-emerald-500 h-1.5 bg-zinc-700 rounded-lg appearance-none"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Tabs & Lists */}
        <div className="lg:col-span-4 flex flex-col gap-4 h-[calc(100vh-8rem)]">
          
          {/* Tab Navigation */}
          <div className="flex p-1 bg-zinc-900 rounded-xl border border-zinc-800">
            <button 
              onClick={() => setActiveTab('playlist')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors ${activeTab === 'playlist' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <ListMusic className="w-4 h-4" /> Playlist
            </button>
            <button 
              onClick={() => setActiveTab('jingles')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors ${activeTab === 'jingles' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <Layers className="w-4 h-4" /> Vinhetas
            </button>
            <button 
              onClick={() => setActiveTab('programs')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors ${activeTab === 'programs' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <Clock className="w-4 h-4" /> Programas
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-xl flex flex-col overflow-hidden">
            
            {/* PLAYLIST TAB */}
            {activeTab === 'playlist' && (
              <>
                <div className="flex items-center justify-between mb-4 bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setIsShuffle(!isShuffle)} className={`p-2 rounded-lg ${isShuffle ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-500 hover:bg-zinc-800'}`} title="Reprodução Aleatória">
                      <Shuffle className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2 ml-2 border-l border-zinc-800 pl-4">
                      <span className="text-xs font-medium text-zinc-400">Crossfade:</span>
                      <input 
                        type="range" min="0" max="10" step="1" 
                        value={crossfadeTime}
                        onChange={(e) => setCrossfadeTime(Number(e.target.value))}
                        className="w-16 accent-emerald-500 h-1.5 bg-zinc-700 rounded-lg appearance-none"
                      />
                      <span className="text-xs text-zinc-500 w-6">{crossfadeTime}s</span>
                    </div>
                  </div>
                  <label className="cursor-pointer bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1">
                    <Plus className="w-4 h-4" /> MÚSICAS
                    <input type="file" accept="audio/*" multiple className="hidden" onChange={(e) => handleFileUpload(e, 'track')} />
                  </label>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {queue.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-sm text-center">
                      <Upload className="w-8 h-8 mb-2 opacity-30" />
                      Adicione músicas para tocar
                    </div>
                  ) : (
                    queue.map((track, idx) => (
                      <div key={track.id} className={`group p-2 rounded-lg border flex items-center gap-3 ${idx === currentIndex && !isJinglePlaying ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-zinc-950 border-zinc-800 text-zinc-300'}`}>
                        <button onClick={() => playTrack(idx, true)} className="w-6 h-6 flex items-center justify-center hover:text-emerald-400">
                          {idx === currentIndex && isPlaying && !isJinglePlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        </button>
                        <span className="truncate flex-1 text-sm">{track.title}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => {
                              if (idx === 0) return;
                              const newQ = [...queue];
                              [newQ[idx - 1], newQ[idx]] = [newQ[idx], newQ[idx - 1]];
                              setQueue(newQ);
                              if (currentIndex === idx) setCurrentIndex(idx - 1);
                              else if (currentIndex === idx - 1) setCurrentIndex(idx);
                            }}
                            className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-white"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button 
                            onClick={() => {
                              if (idx === queue.length - 1) return;
                              const newQ = [...queue];
                              [newQ[idx + 1], newQ[idx]] = [newQ[idx], newQ[idx + 1]];
                              setQueue(newQ);
                              if (currentIndex === idx) setCurrentIndex(idx + 1);
                              else if (currentIndex === idx + 1) setCurrentIndex(idx);
                            }}
                            className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-white"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {/* JINGLES TAB */}
            {activeTab === 'jingles' && (
              <>
                <div className="mb-4 space-y-3">
                  <div className="flex items-center justify-between bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                    <span className="text-xs font-medium text-zinc-400 px-2">Tocar a cada:</span>
                    <select 
                      value={autoJingleInterval} 
                      onChange={(e) => setAutoJingleInterval(Number(e.target.value))}
                      className="bg-zinc-800 text-sm rounded px-2 py-1 border-none outline-none"
                    >
                      <option value={0}>Manual</option>
                      <option value={1}>1 música</option>
                      <option value={3}>3 músicas</option>
                      <option value={5}>5 músicas</option>
                    </select>
                    <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 ml-auto">
                      <Plus className="w-4 h-4" /> VINHETA
                      <input type="file" accept="audio/*" multiple className="hidden" onChange={(e) => handleFileUpload(e, 'jingle')} />
                    </label>
                  </div>
                  <div className="text-xs text-zinc-500 text-center">
                    Músicas tocadas desde a última vinheta: <strong className="text-emerald-400">{tracksPlayed}</strong>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {jingles.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-sm text-center">
                      <Upload className="w-8 h-8 mb-2 opacity-30" />
                      Adicione vinhetas ou comerciais
                    </div>
                  ) : (
                    jingles.map((jingle, idx) => (
                      <div key={jingle.id} className={`p-2 rounded-lg border flex items-center gap-3 ${idx === currentJingleIndex ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-zinc-950 border-zinc-800 text-zinc-300'}`}>
                        <button onClick={() => playJingle(idx)} className="w-6 h-6 flex items-center justify-center hover:text-amber-400 bg-zinc-800 rounded">
                          <PlayCircle className="w-4 h-4" />
                        </button>
                        <span className="truncate flex-1 text-sm">{jingle.title}</span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {/* PROGRAMS TAB */}
            {activeTab === 'programs' && (
              <>
                <div className="mb-4 flex justify-end">
                  <button onClick={addProgram} className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1">
                    <Plus className="w-4 h-4" /> NOVO PROGRAMA
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                  {programs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-sm text-center">
                      <Clock className="w-8 h-8 mb-2 opacity-30" />
                      Crie sua grade de programação
                    </div>
                  ) : (
                    programs.map((prog, idx) => (
                      <div key={prog.id} className="bg-zinc-950 border border-zinc-800 p-3 rounded-xl space-y-2">
                        <input 
                          type="text" 
                          value={prog.name}
                          onChange={(e) => {
                            const newP = [...programs];
                            newP[idx].name = e.target.value;
                            setPrograms(newP);
                          }}
                          className="w-full bg-transparent font-bold text-white outline-none border-b border-zinc-800 focus:border-emerald-500"
                        />
                        <div className="flex gap-2 text-sm">
                          <input type="time" value={prog.startTime} onChange={(e) => { const newP = [...programs]; newP[idx].startTime = e.target.value; setPrograms(newP); }} className="bg-zinc-800 rounded px-2 py-1 outline-none" />
                          <span className="text-zinc-500 self-center">até</span>
                          <input type="time" value={prog.endTime} onChange={(e) => { const newP = [...programs]; newP[idx].endTime = e.target.value; setPrograms(newP); }} className="bg-zinc-800 rounded px-2 py-1 outline-none" />
                        </div>
                        <select 
                          value={prog.type}
                          onChange={(e) => { const newP = [...programs]; newP[idx].type = e.target.value as 'live'|'playlist'; setPrograms(newP); }}
                          className="w-full bg-zinc-800 text-sm rounded px-2 py-1 outline-none"
                        >
                          <option value="playlist">Automático (Playlist)</option>
                          <option value="live">Ao Vivo (PC/Mic)</option>
                        </select>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div>
                            <label className="text-xs text-zinc-500 block mb-1">Vinheta de Início</label>
                            <select 
                              value={prog.startJingleId || ''}
                              onChange={(e) => { const newP = [...programs]; newP[idx].startJingleId = e.target.value; setPrograms(newP); }}
                              className="w-full bg-zinc-800 text-xs rounded px-2 py-1 outline-none"
                            >
                              <option value="">Nenhuma</option>
                              {jingles.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-zinc-500 block mb-1">Vinheta de Fim</label>
                            <select 
                              value={prog.endJingleId || ''}
                              onChange={(e) => { const newP = [...programs]; newP[idx].endJingleId = e.target.value; setPrograms(newP); }}
                              className="w-full bg-zinc-800 text-xs rounded px-2 py-1 outline-none"
                            >
                              <option value="">Nenhuma</option>
                              {jingles.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Column: Decks & Mixer */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Main Player Deck */}
          <div className={`bg-zinc-900 border rounded-2xl p-8 shadow-xl relative overflow-hidden transition-colors ${isJinglePlaying ? 'border-amber-500/50' : 'border-zinc-800'}`}>
            {isPlaying && !isJinglePlaying && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-emerald-500/5 blur-[100px] pointer-events-none"></div>
            )}
            {isJinglePlaying && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-amber-500/10 blur-[100px] pointer-events-none"></div>
            )}
            
            <div className="flex flex-col items-center text-center mb-8 relative z-10">
              <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-widest mb-4 ${isJinglePlaying ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-zinc-400'}`}>
                {isJinglePlaying ? 'VINHETA EM REPRODUÇÃO' : 'DECK PRINCIPAL'}
              </span>
              <h2 className="text-3xl font-bold text-white mb-2 truncate w-full px-4">
                {isJinglePlaying 
                  ? jingles[currentJingleIndex]?.title 
                  : (queue[currentIndex]?.title || 'Nenhuma faixa')}
              </h2>
              <p className="text-zinc-500">
                {isJinglePlaying ? 'A playlist está pausada/reduzida' : (queue.length > 0 ? `Faixa ${currentIndex + 1} de ${queue.length}` : 'Aguardando músicas')}
              </p>
            </div>

            {/* Progress Bar (Only for main track) */}
            {!isJinglePlaying && (
              <div className="mb-8 relative z-10">
                <div className="flex justify-between text-xs font-mono text-zinc-400 mb-2">
                  <span>{formatTime(progress)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all duration-100 ease-linear" style={{ width: `${(progress / (duration || 1)) * 100}%` }}></div>
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center justify-center gap-6 relative z-10">
              <button onClick={prevTrack} disabled={isJinglePlaying} className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center hover:bg-zinc-700 text-zinc-300 disabled:opacity-30">
                <SkipBack className="w-5 h-5" />
              </button>
              <button onClick={togglePlay} disabled={isJinglePlaying && !isPlaying} className={`w-20 h-20 rounded-full flex items-center justify-center transition-transform active:scale-95 text-zinc-950 shadow-lg ${isJinglePlaying ? 'bg-amber-500 hover:bg-amber-400 shadow-amber-500/20' : 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/20'}`}>
                {isPlaying || isJinglePlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
              </button>
              <button onClick={nextTrack} disabled={isJinglePlaying} className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center hover:bg-zinc-700 text-zinc-300 disabled:opacity-30">
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            {/* Manual Jingle Trigger */}
            <div className="mt-8 pt-6 border-t border-zinc-800 relative z-10">
              <div className="flex items-center gap-3">
                <select 
                  value={selectedJingleId}
                  onChange={(e) => setSelectedJingleId(e.target.value)}
                  className="flex-1 bg-zinc-950 border border-zinc-800 text-sm rounded-xl px-4 py-3 outline-none text-zinc-300 focus:border-amber-500 transition-colors"
                >
                  <option value="">Selecione uma vinheta para rodar...</option>
                  {jingles.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
                <button 
                  onClick={() => {
                    const idx = jingles.findIndex(j => j.id === selectedJingleId);
                    if (idx !== -1) playJingle(idx, 'next');
                  }}
                  disabled={!selectedJingleId || isJinglePlaying}
                  className="bg-amber-500 hover:bg-amber-400 text-zinc-950 px-6 py-3 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-amber-500/20"
                >
                  <PlayCircle className="w-5 h-5" /> Rodar Vinheta
                </button>
              </div>
            </div>
          </div>

          {/* Live Mixer Section */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Radio className="w-5 h-5 text-emerald-500" />
                Mixer de Transmissão Ao Vivo
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* PC Audio Capture */}
              <div className={`border rounded-xl p-5 transition-colors ${pcLiveActive ? 'bg-blue-500/10 border-blue-500/30' : 'bg-zinc-950 border-zinc-800'}`}>
                <div className="flex items-center justify-between mb-4">
                  <h4 className={`text-sm font-bold flex items-center gap-2 ${pcLiveActive ? 'text-blue-400' : 'text-zinc-400'}`}>
                    <MonitorUp className="w-4 h-4" /> ÁUDIO DO COMPUTADOR
                  </h4>
                  {pcLiveActive && <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span></span>}
                </div>
                <button onClick={togglePcLive} className={`w-full py-3 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${pcLiveActive ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-lg shadow-blue-500/20' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>
                  {pcLiveActive ? <StopCircle className="w-4 h-4" /> : <MonitorUp className="w-4 h-4" />}
                  {pcLiveActive ? 'PARAR CAPTURA' : 'CAPTURAR ÁUDIO DO PC'}
                </button>
                <p className="text-xs text-zinc-500 mt-3 text-center">Transmita o som de outros programas (Spotify, YouTube, etc).</p>
              </div>

              {/* Microphone */}
              <div className={`border rounded-xl p-5 transition-colors ${micActive ? 'bg-red-500/10 border-red-500/30' : 'bg-zinc-950 border-zinc-800'}`}>
                <div className="flex items-center justify-between mb-4">
                  <h4 className={`text-sm font-bold flex items-center gap-2 ${micActive ? 'text-red-400' : 'text-zinc-400'}`}>
                    <Mic className="w-4 h-4" /> MICROFONE (LOCUÇÃO)
                  </h4>
                  {micActive && <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>}
                </div>
                <button onClick={toggleMic} className={`w-full py-3 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${micActive ? 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>
                  {micActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {micActive ? 'DESLIGAR MIC' : 'FALAR AO VIVO'}
                </button>
                <p className="text-xs text-zinc-500 mt-3 text-center">Abaixa a música automaticamente (Auto-Ducking).</p>
              </div>
            </div>

            {/* Crossfader: Playlist vs Live PC */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
              <h4 className="text-sm font-bold text-zinc-400 mb-6 text-center">FADER DE TRANSIÇÃO (PLAYLIST ↔ ÁUDIO DO PC)</h4>
              <div className="flex items-center gap-4">
                <div className={`text-xs font-bold w-20 text-right ${liveFader < 50 ? 'text-emerald-400' : 'text-zinc-500'}`}>PLAYLIST</div>
                <input 
                  type="range" min="0" max="100" step="1" 
                  value={liveFader}
                  onChange={(e) => setLiveFader(Number(e.target.value))}
                  className="flex-1 accent-white h-2 bg-gradient-to-r from-emerald-500 via-zinc-700 to-blue-500 rounded-lg appearance-none cursor-pointer"
                />
                <div className={`text-xs font-bold w-20 ${liveFader > 50 ? 'text-blue-400' : 'text-zinc-500'}`}>ÁUDIO PC</div>
              </div>
            </div>

          </div>
        </div>

      </main>
    </div>
  );
}
