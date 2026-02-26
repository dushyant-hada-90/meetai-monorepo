"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Mic, MicOff, Video, VideoOff, ChevronDown, Monitor } from "lucide-react"

interface Props {
  onJoin: (opts: { audio: boolean; video: boolean; deviceId?: { audio?: string; video?: string } }) => void
}

export const CallLobby = ({ onJoin }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  
  // State
  const [cameraOn, setCameraOn] = useState(true)
  const [micOn, setMicOn] = useState(true)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)
  
  // Devices
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedAudioId, setSelectedAudioId] = useState<string>("")
  const [selectedVideoId, setSelectedVideoId] = useState<string>("")
  const [showAudioMenu, setShowAudioMenu] = useState(false)
  const [showVideoMenu, setShowVideoMenu] = useState(false)
  
  // Loading states
  const [isTogglingCamera, setIsTogglingCamera] = useState(false)

  // Audio context ref for cleanup
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Keep streamRef in sync
  useEffect(() => {
    streamRef.current = stream
  }, [stream])

  // Initialize devices on mount
  useEffect(() => {
    initDevices()
    return () => {
      // Cleanup stream on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Audio Level Visualizer
  useEffect(() => {
    if (!stream || !micOn) {
      setAudioLevel(0)
      return
    }

    // Check if stream has active audio tracks
    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0 || !audioTracks.some(t => t.readyState === 'live')) {
      setAudioLevel(0)
      return
    }

    let audioContext: AudioContext | null = null
    let microphone: MediaStreamAudioSourceNode | null = null
    let analyser: AnalyserNode | null = null
    let animFrameId: number | null = null

    try {
      audioContext = new AudioContext()
      audioContextRef.current = audioContext
      analyser = audioContext.createAnalyser()
      microphone = audioContext.createMediaStreamSource(stream)

      analyser.smoothingTimeConstant = 0.8
      analyser.fftSize = 1024

      microphone.connect(analyser)

      const updateLevel = () => {
        if (!analyser) return
        const array = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(array)
        const values = array.reduce((a, b) => a + b, 0)
        const average = values / array.length
        setAudioLevel(Math.min(100, average * 2))
        animFrameId = requestAnimationFrame(updateLevel)
      }

      animFrameId = requestAnimationFrame(updateLevel)
    } catch (err) {
      console.error('Error setting up audio visualizer:', err)
    }

    return () => {
      try {
        if (animFrameId !== null) cancelAnimationFrame(animFrameId)
        if (microphone) microphone.disconnect()
        if (analyser) analyser.disconnect()
        if (audioContext && audioContext.state !== 'closed') {
          audioContext.close()
        }
      } catch (err) {
        // Ignore cleanup errors
      }
      audioContextRef.current = null
    }
  }, [stream, micOn])

  // Device Management
  async function initDevices() {
    try {
      // Request generic permissions first to enumerate labels
      const initialStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audio = devices.filter(d => d.kind === "audioinput")
      const video = devices.filter(d => d.kind === "videoinput")
      
      setAudioDevices(audio)
      setVideoDevices(video)
      
      // Cleanup initial permission stream
      initialStream.getTracks().forEach(t => t.stop())

      // Start actual stream with defaults or first found
      if (video[0]?.deviceId) setSelectedVideoId(video[0].deviceId)
      if (audio[0]?.deviceId) setSelectedAudioId(audio[0].deviceId)
      
      await startStream(video[0]?.deviceId, audio[0]?.deviceId, true, true)

    } catch (err) {
      console.error("Permission error", err)
      setPermissionError("Please allow camera and microphone access to join the meeting.")
    }
  }

  const startStream = useCallback(async (
    videoId?: string, 
    audioId?: string, 
    enableVideo = true,
    enableAudio = true
  ) => {
    cleanupStream()

    try {
      const constraints: MediaStreamConstraints = {}
      
      if (enableVideo) {
        constraints.video = videoId ? { deviceId: { exact: videoId } } : true
      }
      if (enableAudio) {
        constraints.audio = audioId ? { deviceId: { exact: audioId } } : true
      }

      // Don't request empty stream
      if (!enableVideo && !enableAudio) {
        setStream(null)
        return
      }

      const newStream = await navigator.mediaDevices.getUserMedia(constraints)
      
      setStream(newStream)
      if (videoRef.current && enableVideo) {
        videoRef.current.srcObject = newStream
      }

      // Update selection state
      const tracks = newStream.getTracks()
      const vidTrack = tracks.find(t => t.kind === "video")
      const audTrack = tracks.find(t => t.kind === "audio")
      
      if (vidTrack) setSelectedVideoId(vidTrack.getSettings().deviceId || "")
      if (audTrack) setSelectedAudioId(audTrack.getSettings().deviceId || "")

      setPermissionError(null)
    } catch (err) {
      console.error("Stream start error", err)
      setPermissionError("Could not access selected device. Please check your permissions.")
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function cleanupStream() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop())
      setStream(null)
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  // Toggle camera - FULLY STOP/START hardware
  const toggleCamera = async () => {
    if (isTogglingCamera) return
    setIsTogglingCamera(true)
    
    try {
      if (cameraOn) {
        // Stop camera completely - this turns off the hardware LED
        if (stream) {
          stream.getVideoTracks().forEach(t => t.stop())
        }
        setCameraOn(false)
        if (videoRef.current) {
          videoRef.current.srcObject = null
        }
        // If mic is also off, clear stream entirely
        if (!micOn) {
          setStream(null)
        }
      } else {
        // Restart camera - get fresh stream
        await startStream(selectedVideoId, selectedAudioId, true, micOn)
        setCameraOn(true)
      }
    } finally {
      setIsTogglingCamera(false)
    }
  }

  // Toggle mic - FULLY STOP/START hardware
  const toggleMic = async () => {
    if (micOn) {
      // Stop mic completely - this truly stops the mic hardware
      if (stream) {
        stream.getAudioTracks().forEach(t => t.stop())
      }
      setMicOn(false)
      // If camera is also off, clear stream entirely
      if (!cameraOn) {
        setStream(null)
      }
    } else {
      // Restart mic - get fresh stream
      await startStream(selectedVideoId, selectedAudioId, cameraOn, true)
      setMicOn(true)
    }
  }

  const handleDeviceChange = async (type: 'audio' | 'video', deviceId: string) => {
    if (type === 'audio') {
      setSelectedAudioId(deviceId)
      await startStream(selectedVideoId, deviceId, cameraOn, true)
      setMicOn(true)
    } else {
      setSelectedVideoId(deviceId)
      await startStream(deviceId, selectedAudioId, true, micOn)
      setCameraOn(true)
    }
    setShowAudioMenu(false)
    setShowVideoMenu(false)
  }

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowAudioMenu(false)
      setShowVideoMenu(false)
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4 md:p-8 transition-colors">
      <div className="flex w-full max-w-4xl flex-col items-center gap-8">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl md:text-3xl font-semibold text-foreground tracking-tight">
            Ready to join?
          </h1>
          <p className="text-sm text-muted-foreground">
            Check your audio and video before joining
          </p>
        </div>

        {/* Main Content Card */}
        <div className="w-full max-w-2xl">
          {/* Video Preview Container */}
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-card border border-border shadow-lg">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`h-full w-full object-cover transition-opacity duration-300 scale-x-[-1] ${
                cameraOn ? 'opacity-100' : 'opacity-0'
              }`}
            />
            
            {/* Camera Off State */}
            {!cameraOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-muted">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-secondary">
                  <VideoOff size={40} className="text-muted-foreground" />
                </div>
                <p className="text-muted-foreground font-medium">Camera is off</p>
              </div>
            )}

            {/* Loading overlay for camera toggle */}
            {isTogglingCamera && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Audio Level Indicator */}
            {micOn && (
              <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-background/80 dark:bg-card/80 px-3 py-2 backdrop-blur-md border border-border">
                <Mic size={14} className="text-primary" />
                <div className="flex items-end gap-0.5 h-4">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div 
                      key={i} 
                      className="w-1 rounded-full transition-all duration-100 bg-primary"
                      style={{ 
                        height: `${Math.max(15, Math.min(100, audioLevel * (i * 0.5)))}%`,
                        opacity: audioLevel > (i * 15) ? 1 : 0.3
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Mic Off Badge */}
            {!micOn && (
              <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-destructive/10 px-3 py-2 border border-destructive/20">
                <MicOff size={14} className="text-destructive" />
                <span className="text-xs font-medium text-destructive">Mic off</span>
              </div>
            )}

            {/* Permission Error */}
            {permissionError && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/95 p-6 text-center">
                <div className="space-y-3">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                    <Monitor size={24} className="text-destructive" />
                  </div>
                  <p className="text-destructive text-sm font-medium max-w-xs">{permissionError}</p>
                </div>
              </div>
            )}
          </div>

          {/* Control Bar - Google Meet Style */}
          <div className="mt-6 flex items-center justify-center gap-3">
            {/* Mic Button with Dropdown */}
            <div className="relative">
              <div className="flex items-center rounded-full border border-border bg-card shadow-sm overflow-hidden">
                <button
                  onClick={toggleMic}
                  className={`flex items-center justify-center p-4 transition-colors ${
                    micOn 
                      ? "text-foreground hover:bg-muted" 
                      : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  }`}
                  title={micOn ? "Turn off microphone" : "Turn on microphone"}
                >
                  {micOn ? <Mic size={22} /> : <MicOff size={22} />}
                </button>
                <div className="h-8 w-px bg-border" />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowAudioMenu(!showAudioMenu)
                    setShowVideoMenu(false)
                  }}
                  className="flex items-center justify-center p-3 text-foreground hover:bg-muted transition-colors"
                  title="Select microphone"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
              
              {/* Audio Device Menu */}
              {showAudioMenu && (
                <div 
                  className="absolute bottom-full mb-2 left-0 min-w-[280px] rounded-xl bg-popover border border-border shadow-xl p-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Microphone
                  </div>
                  {audioDevices.map(d => (
                    <button
                      key={d.deviceId}
                      onClick={() => handleDeviceChange('audio', d.deviceId)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        selectedAudioId === d.deviceId 
                          ? "bg-primary/10 text-primary font-medium" 
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      {d.label || `Microphone ${d.deviceId.slice(0, 8)}...`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Camera Button with Dropdown */}
            <div className="relative">
              <div className="flex items-center rounded-full border border-border bg-card shadow-sm overflow-hidden">
                <button
                  onClick={toggleCamera}
                  disabled={isTogglingCamera}
                  className={`flex items-center justify-center p-4 transition-colors ${
                    cameraOn 
                      ? "text-foreground hover:bg-muted" 
                      : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  } ${isTogglingCamera ? 'opacity-50 cursor-wait' : ''}`}
                  title={cameraOn ? "Turn off camera" : "Turn on camera"}
                >
                  {cameraOn ? <Video size={22} /> : <VideoOff size={22} />}
                </button>
                <div className="h-8 w-px bg-border" />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowVideoMenu(!showVideoMenu)
                    setShowAudioMenu(false)
                  }}
                  className="flex items-center justify-center p-3 text-foreground hover:bg-muted transition-colors"
                  title="Select camera"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
              
              {/* Video Device Menu */}
              {showVideoMenu && (
                <div 
                  className="absolute bottom-full mb-2 left-0 min-w-[280px] rounded-xl bg-popover border border-border shadow-xl p-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Camera
                  </div>
                  {videoDevices.map(d => (
                    <button
                      key={d.deviceId}
                      onClick={() => handleDeviceChange('video', d.deviceId)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        selectedVideoId === d.deviceId 
                          ? "bg-primary/10 text-primary font-medium" 
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      {d.label || `Camera ${d.deviceId.slice(0, 8)}...`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Join Button */}
          <div className="mt-8 flex justify-center">
            <button
              onClick={() => {
                cleanupStream()
                onJoin({ audio: micOn, video: cameraOn })
              }}
              className="rounded-full bg-primary px-10 py-4 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98]"
            >
              Join now
            </button>
          </div>

          {/* Hints */}
          <p className="mt-4 text-center text-xs text-muted-foreground">
            You can change these settings during the call
          </p>
        </div>
      </div>
    </div>
  )
}