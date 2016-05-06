(function() {
  'use strict';

  angular
    .module('bd.app')
    .factory('audioPlayer', audioPlayer);

  var noteFileName = {
    'C' : 'C',
    'C♯': 'Db',
    'D♭': 'Db',
    'D' : 'D',
    'D♯': 'Eb',
    'E♭': 'Eb',
    'E' : 'E',
    'F' : 'F',
    'F♯': 'Gb',
    'G♭': 'Gb',
    'G' : 'G',
    'G♯': 'Ab',
    'A♭': 'Ab',
    'A' : 'A',
    'A♯': 'Bb',
    'B♭': 'Bb',
    'B' : 'B'
  };

  function audioPlayer(context, soundsUrl) {

    function AudioPlayer() {
      this.playing = false;
      this.playback = this.playback.bind(this);
      this.setBpm(60);
      this.bufferLoader = new BufferLoader(context, soundsUrl);
      this.playingNotes = [];

      this.bass = {
        muted: false,
        audio: context.createGain()
      };
      this.drums = {
        muted: false,
        audio: context.createGain()
      };
    }

    var bassSounds = {
      finger: {
        getResources: function(sound) {
          var note = sound.note;
          if (note.name === 'x') {
            return ['sounds/bass/finger/X{1}'.format(noteFileName[note.name], sound.string.index+1)];
          }
          // return ['sounds/bass/finger/sine'.format(noteFileName[note.name], note.octave||'')];
          return ['sounds/bass/finger/{0}{1}'.format(noteFileName[note.name], note.octave||'')];
        }
      },/*
      hammer: {
        getResources: function(note) {
          return ['sounds/tap-{0}{1}'.format(noteFileName[note.name], note.octave||'')];
        }
      },
      slap: {
        getResources: function(note) {
          return ['sounds/slap-{0}{1}'.format(noteFileName[note.name], note.octave||'')];
        }
      },
      pull: {
        getResources: function(note) {
          return ['sounds/pull-{0}{1}'.format(noteFileName[note.name], note.octave||'')];
        }
      }*/
    };

    AudioPlayer.prototype.playback = function(arg) {
      var timeSignature = this.composition.timeSignature;
      var barsCount = this.composition.length;
      if (this.playing) {
        var playTime = context.currentTime-this.startTime;
        if (playTime > this.subbeatIndex*this.subbeatTime) {
          var subbeat = (this.subbeatIndex % (4*timeSignature.top));
          if (subbeat % 4 === 0) {
            this.beatIndex++;
            if (this.beatIndex-1 === timeSignature.top) {
              this.beatIndex = 1;
              this.barIndex = (this.barIndex +1) % barsCount;
            }
            // console.log('bar: '+(this.barIndex+1)+' / '+barsCount);
            // console.log('beat: '+this.beatIndex);
            // console.log('subbeat: '+(subbeat+1));
            this.beatCallback(
              this.barIndex+1,
              this.beatIndex,
              this.bpm
            );
          }
          var bar = this.composition.bars[this.barIndex];
          var drumsSounds = bar.drumsBeats[this.beatIndex-1].subbeats[subbeat % 4];
          var drumName;
          for (drumName in drumsSounds) {
            var sound = drumsSounds[drumName];
            if (sound.volume > 0) {
              var audioData = this.bufferLoader.loadResource(sound.drum.filename);
              if (audioData) {
                var source = context.createBufferSource();
                source.buffer = audioData;
                var gain = context.createGain();
                gain.gain.value = sound.volume;
                source.connect(gain);
                gain.connect(this.drums.audio);
                source.start(context.currentTime, 0, sound.drum.duration);
              }
            }
          };

          // console.log('subbeat: '+subbeat);
          var stringsSounds = bar.bass[subbeat];
          // console.log(stringsSounds);
          var sounds = stringsSounds.filter(function(sound) {
            if (!sound.style || !sound.note.name) {
              return;
            }
            var note = sound.note;
            // console.log(note.style+' '+note.name);
            // console.log(note);
            var source = context.createBufferSource();
            var gain = context.createGain();

            source.connect(gain);
            gain.connect(this.bass.audio);
            var audioData = this.bufferLoader.loadResource(bassSounds[sound.style].getResources(sound)[0]);
            //console.log(this.bufferLoader.loadedResources);
            if (audioData) {
              source.buffer = audioData;
              var duration = sound.noteLength.length?
                this.subbeatTime*sound.noteLength.length*timeSignature.bottom*4 :
                this.subbeatTime;
              if (sound.noteLength.dotted) {
                duration *= 1.5;
              }
              if (sound.noteLength.staccato) {
                duration = 0.92*duration-this.subbeatTime*0.2;
              }
              var startTime = context.currentTime;
              gain.gain.setValueAtTime(sound.volume, startTime);
              gain.gain.setValueAtTime(sound.volume, startTime+duration-0.05);
              source.start(startTime, 0, duration+0.05);
              gain.gain.linearRampToValueAtTime(0.001, startTime+duration);
              // gain.gain.exponentialRampToValueAtTime(0.001, startTime+duration);

              var sound = {
                note: note,
                source: source,
                gain: gain,
                startTime: startTime,
                endTime: startTime+duration,
              };
              this.playingNotes.push(sound);
            }
          }, this);
          this.subbeatIndex++;
        }
        if (this.playingNotes.length) {
          var currentTime = context.currentTime;
          this.playingNotes = this.playingNotes.filter(function(playingNote) {
            if (currentTime > playingNote.endTime) {
              // maybe some cleanup
              playingNote.gain.gain.value = 0.001;
              return false;
            }
            return true;
          });
        }
        requestAnimationFrame(this.playback);
      }
    }

    AudioPlayer.prototype._play = function(composition) {
      this.playing = true;
      this.startTime = context.currentTime;
      this.subbeatIndex = 0;
      this.beatIndex = 0;
      this.barIndex = 0;
      this.composition = composition;
      this.playback();
    };

    AudioPlayer.prototype.setBpm = function(bpm) {
      this.bpm = bpm;
      var beatTime = 60/bpm;
      this.subbeatTime = beatTime/4;
    }

    AudioPlayer.prototype.fetchSoundResources = function(sound) {
      if (sound.style && sound.note) {
        var resources = bassSounds[sound.style].getResources(sound);
        this.bufferLoader.loadResources(resources);
      }
    }

    AudioPlayer.prototype.play = function(composition, beatCallback) {
      console.log('PLAY');
      var player = this;
      this.beatCallback = angular.isFunction(beatCallback)? beatCallback : angular.noop;
      function afterLoad() {
        player._play(composition);
      }

      var resources = [];
      // var resourcesIndexes = {};
      var barIndex, bar, subbeatIndex, string;
      for (barIndex = 0; barIndex < composition.length; barIndex++) {
        bar = composition.bars[barIndex];
        for (subbeatIndex = 0; subbeatIndex < composition.timeSignature.top*4; subbeatIndex++) {
          for (string = 0; string < 4; string++) {
            var bassSound = bar.bass[subbeatIndex][string];
            if (bassSound.note.name && bassSound.style) {
              var subbeatResources = bassSounds[bassSound.style].getResources(bassSound);
              subbeatResources.forEach(function(resource) {
                if (resources.indexOf(resource) === -1) {
                  resources.push(resource);
                }
              });
            }
          }
        }
      }
      console.log(resources);
      if (resources.length) {
        this.bufferLoader.loadResources(resources, afterLoad);
      } else {
        player._play(composition);
      }
    };

    AudioPlayer.prototype.stop = function(noteLength) {
      this.playing = false;
      this.playingNotes.forEach(function(playingNote) {
        playingNote.gain.gain.value = 0;
        // playingNote.source.stop();
      });
    };

    AudioPlayer.prototype.playSound = function(bassSound) {
      var resources = bassSounds[bassSound.style].getResources(bassSound);
      var player = this;
      function afterLoad(audioBuffer) {
        console.log('------------------');
        /*
        if (player.playing) {
          player.gain.gain.linearRampToValueAtTime(0.001, context.currentTime+0.03);
          //player.source.stop();
        }*/
        if (player.source && player.source.playing) {
          // player.source.stop();
          player.source.gain.gain.setValueAtTime(bassSound.volume, context.currentTime);
          player.source.gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime+0.05);
          var fadingSource = player.source;
          setTimeout(function() {
            // fadingSource.stop();
          }, 55);
        }
        var source = context.createBufferSource();
        var gain = context.createGain();

        source.buffer = audioBuffer;
        source.connect(gain);
        gain.connect(context.destination);

        //var beatTime = 60/bpm;
        //this.subbeatTime = beatTime/4;
        var subbeatTime = 1/4;

        var duration = bassSound.noteLength.length? subbeatTime*bassSound.noteLength.length*16 : subbeatTime;
        if (bassSound.noteLength.dotted) {
          duration *= 1.5;
        }
        if (bassSound.noteLength.staccato) {
          duration = 0.8*duration;
        }
        var startTime = context.currentTime;
        startTime+= 0.05;
        gain.gain.setValueAtTime(bassSound.volume, startTime);
        source.start(startTime, 0, duration+0.05);
        //source.playbackRate.value = 2;
        gain.gain.linearRampToValueAtTime(0.001, startTime+duration);
        player.source = source;
        player.gain = gain;

        source.playing = true;
        source.gain = gain;
        source.addEventListener('ended', function(evt) {
          evt.target.playing = false;
        });
      }

      this.bufferLoader.loadResource(resources[0], afterLoad);
    };

    return new AudioPlayer();
  }
})();