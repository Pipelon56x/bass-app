(function() {
  'use strict';

  angular
    .module('bd.app')
    .directive('soundModel', soundModel)
    .controller('MetadataController', MetadataController)
    .controller('EditModeController', EditModeController);


    function soundModel() {
      return {
        scope: false,
        link: function(scope, elem, attrs) {
          var model = scope[attrs.soundModel];
          Object.defineProperty(model, 'elem', {value: 'static', writable: true});
          model.elem = elem;
          if (model.volume === 0 || model.muted) {
            elem.addClass('muted');
          }
        }
      }
    }

    function MetadataController($scope, workspace, mdPanelRef, projectManager, updateChordLabels) {
      function reorderChords() {
        // ensure correct chords order
        $scope.section.meta.chords.sort(function(a, b) {
          var aValue = a.start[0]*1000 + a.start[1]*10 + a.start[2];
          var bValue = b.start[0]*1000 + b.start[1]*10 + b.start[2];
          return aValue - bValue;
        });
      }

      function selectFirst() {
        if ($scope.section.meta.chords.length) {
          $scope.selectChord($scope.section.meta.chords[0]);
        }
      }

      function setSection(section) {
        if (!section.meta) {
          section.meta = {
            chords: []
          };
        }
        $scope.section = section;
        $scope.form = {
          chord: null, // selected chord item
        };
        selectFirst();
      }

      $scope.close = function() {
        reorderChords();
        mdPanelRef.close();
        projectManager.un('sectionLoaded', setSection);
      };

      $scope.selectChord = function(chord) {
        $scope.form.chord = chord;
      };


      $scope.updatePosition = function() {
        updateChordLabels();
        reorderChords();
      };
      $scope.updateChord = function() {
        var chord = $scope.form.chord;
        if (chord.root) {
          chord.root = chord.root.replace('#', '♯').replace('b', '♭');
        }
        if (chord.bass) {
          chord.bass = chord.bass.replace('#', '♯').replace('b', '♭');
        }
        updateChordLabels();
      };

      $scope.newChord = function() {
        var initialPosition = [1,1,1];
        if ($scope.section.meta.chords.length) {
          var last = $scope.section.meta.chords[$scope.section.meta.chords.length - 1];
          initialPosition = [last.start[0] + 1, 1, 1];
        }
        var newChord = {start: initialPosition};
        $scope.section.meta.chords.push(newChord);
        $scope.selectChord(newChord);
      };

      $scope.keyPressed = function(evt) {
        if (evt.keyCode === 46) {
          var index = $scope.section.meta.chords.indexOf($scope.form.chord);
          if (index !== -1) {
            $scope.form.chord = null;
            $scope.section.meta.chords.splice(index, 1);
            selectFirst();
            updateChordLabels();
          }
        }
      };

      setSection(workspace.section);
      projectManager.on('sectionLoaded', setSection);
    }


  function EditModeController($scope, $timeout, $mdUtil, $mdToast, $mdPanel, context, workspace, audioPlayer, audioVisualiser,
              projectManager, Drums, DrumTrackSection, TrackSection, HighlightTimeline, swiperControl, fretboardViewer, DragHandler, dragablePanel,
              bassEditor, drumEditor, pianoEditor) {

    DragHandler.initialize('.instrument-grid', $scope);
    audioPlayer.setPlaybackSpeed(1);
    $scope.swiperControl = swiperControl;
    $scope.slides = [];
    var keyHandlers = {
      bass: bassEditor,
      drums: drumEditor,
      piano: pianoEditor
    };

    if (!$scope.editor) {
      $scope.$root.editor = {
        beatsPerView: 8,
        slideOnBeat: 1,
        animationDuration: 250,
        fretboardVisible: true,
        layoutLegend: function(value) {
          return [4, 8, 12].indexOf(value) !== -1? value : null;
        },
        animationLabel: function(value, sliderId, label) {
          return "scroll after {0} beats".format(value);
        },
        updateBeatsPerView: function() {
          $scope.editor.beatsPerView = swiperControl.setBeatsPerView($scope.editor.beatsPerView);
        }
      }
      if (!workspace.section && projectManager.section) {
        sectionLoaded(projectManager.section);
      }
    }
    var DEFAULT_PRERENDERED_SLIDES = 2;
    swiperControl.preRenderedSlides = DEFAULT_PRERENDERED_SLIDES;
    var editor = $scope.editor;

    function isLoopNeeded() {
      var playbackRange = swiperControl.lastSlide-swiperControl.firstSlide + 1;
      if (playbackRange > editor.beatsPerView) {
        return true;
      }
    }

    $scope.updateBeatsPerView = function() {
      editor.beatsPerView = swiperControl.setBeatsPerView(editor.beatsPerView)
    };

    $scope.player.visiblePlaybackModeChanged = function(visibleBeatsOnly) {
      // return;
      if (visibleBeatsOnly) {
        var updated = updateLockedPlayerRange();
        if (!updated) {
          $scope.player.visibleBeatsOnly = false;
          $mdToast.show(
            $mdToast.simple()
              .toastClass('error player')
              .textContent('Cannot lock playback on current possition!')
              .position('top center')
          );
          return;
        }
        // TODO: swiper slide size change also affect updateLockedPlayerRange
        swiperControl.barSwiper.on('transitionEnd', updateLockedPlayerRange);
      } else {
        swiperControl.barSwiper.off('transitionEnd', updateLockedPlayerRange);
        if ($scope.player.loop) {
          swiperControl.destroyLoop();
        }
        $scope.player.playbackRangeChanged();
        if ($scope.player.playing && $scope.player.loop && isLoopNeeded()) {
          swiperControl.createLoop();
        }
      }
    };

    $scope.player.playbackRangeChanged = function() {
      console.log('playbackRangeChanged');
      var barBeatsCount = workspace.section.timeSignature.top;
      var firstBar = $scope.player.playbackRange.start;
      var lastBar = $scope.player.playbackRange.end - 1;
      audioPlayer.playbackRange = {
        start: {
          bar: firstBar,
          beat: 1
        },
        end: {
          bar: lastBar,
          beat: workspace.section.timeSignature.top
        }
      };
      var firstBeat = (firstBar - 1) * barBeatsCount;
      var lastBeat = (lastBar) * barBeatsCount - 1;
      swiperControl.setVisibleRange(firstBeat, lastBeat);

      $scope.player.progress.max = lastBeat - firstBeat + 1;
      var barTicks = [];
      for (var i = barBeatsCount; i < $scope.player.progress.max; i+= barBeatsCount) {
        barTicks.push(i);
      }
      $scope.player.progress.ticks = barTicks;
      $scope.player.progress.legend = function(value) {
        return 1 + (value / barBeatsCount);
      }
    }


    timeline = new HighlightTimeline(swiperControl);

    $scope.ui.bpmChanged = function(value) {
      if (value) {
        audioPlayer.setBpm(workspace.section.bpm);
      }
    };

    $scope.player.setProgress = function(id, value) {
      if ($scope.player.playing) {
        $scope.player.playing = false;
        audioPlayer.stop(true);
        $scope.player.progress.restartPlayback = true;
      }
      swiperControl.barSwiper.slideTo(value, 0, true);
    };

    $scope.player.progressReleased = function(id, value) {
      if ($scope.player.progress.restartPlayback) {
        $scope.player.progress.restartPlayback = false;
        // wait a little for rendering
        $timeout($scope.player.play, 75);
      }
    }

    function beatPrepared(evt) {
      var timeToBeat = evt.startTime - evt.eventTime;

      if (!$scope.player.visibleBeatsOnly) {
        var slide = evt.flatIndex - swiperControl.firstSlide;
        // console.log(slide-$scope.barSwiper.activeIndex);
        // console.log(timeToBeat);
        if (evt.flatIndex < swiperControl.barSwiper.snapIndex) {
          slide = swiperControl.lastSlide - swiperControl.firstSlide + slide + 1;
        }
        var offset = slide - swiperControl.barSwiper.snapIndex;
        // console.log('slide: {0} offset: {1}'.format(slide, offset));
        if (offset >= editor.slideOnBeat) {
          setTimeout(function() {
            if ($scope.player.playing) {
              swiperControl.slideTo(
                swiperControl.barSwiper.snapIndex + offset,
                editor.animationDuration,
                true
              );
            }
          }, parseInt(timeToBeat*1000));
        }
      }

      if (!audioVisualiser.enabled && $scope.player.graphEnabled) {
        var audio = audioPlayer.input.muted? workspace.track.audio : audioPlayer.input.audio;
        console.log('activating track visualization');
        audioVisualiser.activate(audio);
      }
      if (audioVisualiser.enabled && !$scope.player.graphEnabled) {
        audioVisualiser.deactivate();
      }
      if (audioVisualiser.enabled) {
        audioVisualiser.beatSync(evt);
      }

      timeline.beatSync(evt);
      fretboardViewer.beatSync(evt);

      // setTimeout(function() {
      $scope.player.progress.update(evt.flatIndex - swiperControl.firstSlide + 1);
      // }, parseInt(timeToBeat*1000));
    }

    $scope.setBeatsPerView = function(value) {
      var snapIndex = swiperControl.barSwiper.snapIndex;
      editor.beatsPerView = swiperControl.setBeatsPerView(value);
      audioVisualiser.updateSize();
      swiperControl.setBeatsPerView(editor.beatsPerView);
      swiperControl.setIndex(snapIndex, 0, true);
    };

    function updateLockedPlayerRange() {
      console.log('** updateLockedPlayerRange');
      var position = swiperControl.getPosition();
      if (position.end.flatIndex > position.start.flatIndex) {
        audioPlayer.playbackRange = position;
        return true;
      }
      return false;
    }

    var timeline;
    var playbackOpts;
    $scope.player.play = function() {
      if ($scope.player.graphEnabled) {
        audioVisualiser.clear();
      }
      fretboardViewer.clearDiagram();

      var start = swiperControl.getPosition().start;
      // this helps when activeIndex is not the same as snapIndex
      swiperControl.barSwiper.activeIndex = swiperControl.barSwiper.snapIndex;
      if ($scope.player.visibleBeatsOnly) {
        updateLockedPlayerRange();
      } else {
        swiperControl.preRenderedSlides = editor.slideOnBeat;
        if ($scope.player.loop && isLoopNeeded()) {
          swiperControl.createLoop();
        }
        swiperControl.updateSlidesVisibility();
      }
      $scope.player.playing = true;
      audioPlayer.setBpm(workspace.section.bpm);
      timeline.start();

      swiperControl.lastRequestedIndex = swiperControl.barSwiper.snapIndex;
      playbackOpts = {
        countdown: $scope.player.countdown,
        start: start
      }

      if (projectManager.project.audioTrack) {
        playbackOpts.audioTrack = Object.assign({
            track: projectManager.project.audioTrack
          }, workspace.section.audioTrack
        );
      }
      audioPlayer.fetchResourcesWithProgress(workspace.section)
        .then(
          audioPlayer.play.bind(
            audioPlayer,
            workspace.section,
            beatPrepared,
            playbackStopped,
            playbackOpts
          ),
          function() {$scope.player.playing = false}
        );
    };

    $scope.player.pause = function() {
      $scope.player.playing = false;
      audioPlayer.stop(true);
    };

    $scope.player.goToStart = function() {
      var restartPlayback = $scope.player.playing;
      if ($scope.player.playing) {
        $scope.player.pause();
      }
      $scope.player.progress.value = 0;
      setTimeout(function() {
        swiperControl.setIndex(0);
        if (restartPlayback) {
          $scope.player.play();
        }
      }, 50);
    };


    function playbackStopped(evt) {
      if (evt) {
        $timeout(_playbackStopped, 1000*(evt.endTime - audioPlayer.context.currentTime));
      } else {
        _playbackStopped();
      }
    }

    function _playbackStopped() {
      if (projectManager.project.audioTrack) {
        projectManager.project.audioTrack.stop();
      }

      if ($scope.player.playing && $scope.player.loop) {
        // loop mode
        if (!swiperControl.loopMode && !$scope.player.visibleBeatsOnly && isLoopNeeded()) {
          swiperControl.createLoop();
          swiperControl.reset();
        } else if ($scope.player.countdown) {
          swiperControl.slideTo(0);
        }
        // update playback options
        playbackOpts.countdown = $scope.player.countdown;
        delete playbackOpts.start;
        audioPlayer.play(workspace.section, beatPrepared, playbackStopped, playbackOpts);
        return;
      }
      if (swiperControl.loopMode) {
        swiperControl.destroyLoop();
      }
      $scope.player.playing = false;
      audioVisualiser.deactivate();
      timeline.stop();
      // setTimeout(fretboardViewer.clearDiagram.bind(fretboardViewer), 1000);
      swiperControl.preRenderedSlides = DEFAULT_PRERENDERED_SLIDES;
    }
    // audioPlayer.on('playbackStopped', playbackStopped);


    $scope.playDrumSound = function(drumName) {
      var sound = {
        drum: drumName,
        volume: 0.85
      };
      audioPlayer.playDrumSample(workspace.track, sound);
    };

    $scope.playPianoSound = function(note) {
      var sound = {
        note: {
          name: note.label[0],
          octave: note.octave,
          length: 1/2
        },
        string: note.label[0]+note.octave,
        volume: 0.85
      };
      audioPlayer.playPianoSample(workspace.track, sound);
    };

    function createSlides(trackSection) {
      var timeSignature = workspace.section.timeSignature;

      var slides = [];
      var beatLabels = workspace.section.beatLabels();
      trackSection.forEachBeat(function(beat) {
        var slideId = beat.bar+'_'+beat.beat;
        slides.push({
          id: slideId,
          beat: beat,
          type: workspace.track.type,
          beatLabel: beatLabels[beat.beat]
        });
      });
      $scope.slides = slides;
    }

    function updateSwiperSlides() {
      $mdUtil.nextTick(function() {
        swiperControl.setSlides($scope.slides, {
          slidesPerView: editor.beatsPerView,
          slidesPerGroup: 1
          // slidesPerGroup: editor.beatsPerSlide
        });
        $scope.player.playbackRangeChanged();
      });
    }


    function updateChordLabels() {
      var barlineElem = swiperControl.barSwiper.wrapper[0];
      Array.from(barlineElem.querySelectorAll('.chord')).forEach(function(elem) {
        elem.remove();
      });
      if (workspace.section.meta && workspace.section.meta.chords) {
        workspace.section.meta.chords.forEach(function(chordInfo) {
          var iBar = chordInfo.start[0];
          var iBeat = chordInfo.start[1];
          var iSubbeat = chordInfo.start[2] || 1;
          var beatElem = swiperControl.getBeatElem(iBar, iBeat);

          var label = '{0}<span class="type">{1}</span>'.format(chordInfo.root, chordInfo.type)
          if (chordInfo.bass) {
            label += '<span class="slash">{0}</span>'.format(chordInfo.bass)
          }
          var elem = angular.element('<span class="chord">'+label+'</span>')[0];
          var subbeatPercWidth = parseInt(100/beatElem.childElementCount);
          if (iBeat === 1 && iSubbeat === 1) {
            elem.style.left = '14px';
            elem.style.width = 'calc({0}% - 28px)'.format(subbeatPercWidth);
          } else {
            elem.style.left = ((iSubbeat-1)*subbeatPercWidth)+'%';
            elem.style.width = subbeatPercWidth+'%';
          }

          angular.element(elem).on('click', function(evt) {
            fretboardViewer.setChord(workspace.section, workspace.track.id, chordInfo);
          });
          angular.element(elem).on('dblclick', function(evt) {
            playChord(chordInfo);
          });
          // beatElem.children[iSubbeat-1].appendChild(elem[0]);

          beatElem.parentNode.appendChild(elem);
        });
      }
    }

    function playChord(chord) {
      var index = workspace.section.meta.chords.indexOf(chord);
      var nextChord = workspace.section.meta.chords[index+1];
      var end = nextChord? angular.copy(nextChord.start) : [workspace.section.length+1, 1, 1];
      end[2]--;
      if (end[2] === 0) {
        end[1]--;
        end[2] = 4;
      }
      if (end[1] === 0) {
        end[0]--;
        end[1] = workspace.section.timeSignature.top;
      }

      var currentRange = audioPlayer.playbackRange;
      audioPlayer.playbackRange = {
        start: {
          bar: chord.start[0],
          beat: chord.start[1]
        },
        end: {
          bar: end[0],
          beat: end[1],
        }
      };
      function beatSync(evt) {
        timeline.beatSync(evt);
        fretboardViewer.beatSync(evt);
      }
      function chordPalybackStopped() {
        audioPlayer.playbackRange = currentRange;
        $scope.player.playing = false;
        timeline.stop();
      }
      $scope.player.playing = true;
      audioPlayer.setBpm(workspace.section.bpm);
      timeline.start();

      audioPlayer.fetchResourcesWithProgress(workspace.section)
        .then(
          audioPlayer.play.bind(
            audioPlayer,
            workspace.section,
            beatSync,
            chordPalybackStopped
          ),
          function() {$scope.player.playing = false}
        );
    }

    function sectionLoaded(section) {
      var initSlide = 0;
      if (swiperControl.barSwiper) {
        initSlide = swiperControl.barSwiper.snapIndex;
      }

      fretboardViewer.clearDiagram();
      audioVisualiser.clear();
      audioVisualiser.reinitialize();

      workspace.section = section;
      $scope.player.playbackRange.start = 1;
      $scope.player.playbackRange.max = section.length + 1;
      $scope.player.playbackRange.end = $scope.player.playbackRange.max;
      $scope.player.progress.value = 0;
      // $scope.player.playbackRangeChanged();

      var trackId = workspace.track? workspace.track.id : 'bass_0';
      workspace.trackSection = section.tracks[trackId];
      if (!workspace.trackSection) {
        workspace.trackSection = initializeNewTrackSection(projectManager.project.tracksMap[trackId]);
      }
      workspace.track = workspace.trackSection;
      workspace.track.id = trackId;

      createSlides(workspace.trackSection);
      $mdUtil.nextTick(function() {
        swiperControl.setSlides($scope.slides, {
          slidesPerView: editor.beatsPerView,
          slidesPerGroup: 1
          // slidesPerGroup: editor.beatsPerSlide
        });

        $scope.player.playbackRangeChanged();
        $mdUtil.nextTick(function() {
          updateChordLabels();
          // just to ensure correct position (last slide is problematic)
          if (initSlide < swiperControl.barSwiper.slides.length) {
            swiperControl.slideTo(initSlide);
          }
        });
      });
    }

    function projectLoaded() {
      swiperControl.slideTo(0, 0);
    }
    projectManager.on('projectLoaded', projectLoaded);
    projectManager.on('sectionLoaded', sectionLoaded);


    function initializeNewTrackSection(track) {
      var TrackSectionClass = track.type === 'drums'? DrumTrackSection : TrackSection;
      var trackSection = new TrackSectionClass(workspace.section, []);
      trackSection.instrument = track.instrument;
      trackSection.audio = track.audio;
      trackSection.type = track.type;
      workspace.section.tracks[track.id] = trackSection;
      return trackSection;
    }
    workspace.initializeNewTrackSection = initializeNewTrackSection;

    $scope.ui.selectTrack = function(trackId) {
      console.log('selectTrack: '+trackId);
      var track = projectManager.project.tracksMap[trackId];
      if (workspace.track === track) {
        return;
      }
      if (workspace.track.type !== track.type) {
        if (!workspace.section.tracks[trackId]) {
          initializeNewTrackSection(track);
        }
        workspace.trackSection = workspace.section.tracks[trackId];
        workspace.trackSection.track = track;
        swiperControl.switchInstrument(track.type);
      }

      if (workspace.track.id !== track.id) {
        console.log('switch new track instrument')
        if (!workspace.section.tracks[trackId]) {
          initializeNewTrackSection(track);
        }
        workspace.trackSection = workspace.section.tracks[trackId];
        workspace.trackSection.track = track;
        swiperControl.rebuildSlides();
      }
      workspace.track = track;
      workspace.track.id = trackId;
      if ($scope.ui.trackId !== trackId) {
        $scope.ui.trackId = trackId;
      }
    };

    if (workspace.section) {
      sectionLoaded(workspace.section);
    }

    $scope.updateSlides = function() {
      createSlides(workspace.trackSection);
      $scope.player.playbackRange.max = workspace.section.length + 1;
      $scope.player.playbackRange.end = $scope.player.playbackRange.max;
      updateSwiperSlides();
    };


    workspace.metadataEditor = function() {
      dragablePanel.open({
        id: 'chords',
        attachTo: document.body,
        templateUrl: 'views/editor/section_chords.html',
        controller: 'MetadataController',
        panelClass: 'metadata',
        locals: {
          updateChordLabels: updateChordLabels
        }
      })
    };

    swiperControl.onTouchEnd = function(sw) {
      $scope.player.progress.update(sw.snapIndex);
    }

    function keyPressed(evt) {
      if (evt.target.tagName === 'INPUT' || evt.target.hasAttribute('contenteditable')) {
        return;
      }
      if (evt.code === 'Space') {
        $scope.$apply(function() {
          $scope.player.playing? $scope.player.pause() : $scope.player.play();
        });
        evt.preventDefault();
        evt.stopPropagation();
        return;
      }
      var handler = keyHandlers[workspace.track.type];
      if (handler) {
        $scope.$apply(function() {
          handler.keyPressed(evt);
        });
      }

    }
    window.addEventListener('keydown', keyPressed);

    $scope.onSelected = function(selection) {
      var x1 = selection.x;
      var y1 = selection.y;
      var x2 = selection.x + selection.width;
      var y2 = selection.y + selection.height;

      var visibleSoundElems = Array.from(document.querySelectorAll('.sound-container'));
      var selection = visibleSoundElems
        .filter(function(el) {
          var bounds = el.getBoundingClientRect();
          return bounds.left >= x1 && bounds.right <= x2 && bounds.top >= y1 && bounds.bottom <= y2;
        })
        .map(function(el) {
          return angular.element(el).scope().sound;
        });
      var instrumentHandler = keyHandlers[workspace.track.type];
      $scope.$apply(function() {
        instrumentHandler.selector.selectMultiple(selection);
      });
    }

    $scope.$on('$destroy', function() {
      projectManager.un('sectionLoaded', sectionLoaded);
      projectManager.un('projectLoaded', projectLoaded);
      window.removeEventListener('keydown', keyPressed);
      // audioPlayer.un('playbackStopped', playbackStopped);
    });
    window.sw = swiperControl;

    // Some useful utilities
    window.setStyle = function(style) {
      workspace.trackSection.forEachSound(function(s) {
        // if (s.style === 'finger') {
          s.style = style;
        // }
      });
    }

  }
})();
