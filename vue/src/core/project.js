import { DrumKit, PercussionKit } from './percussion'

export default function Project (data) {
  console.log(data)

  // Assign track id.
  // DOTO: Store id in data
  const counter = {}
  data.tracks.forEach(track => {
    let index = counter[track.type] || 0
    track.id = `${track.type}_${index}`
    counter[track.type] = index + 1

    if (track.type === 'drums') {
      track.drums = track.kit === 'Drums' ? DrumKit : PercussionKit
    } else if (track.type === 'piano') {
      track.octaves = track.range.map(note => parseInt(note.substr(-1)))
    }
  })
  return {
    name: data.name,
    sections: data.index,
    playlists: data.playlists,
    tracks: data.tracks,

    track (id) {
      return data.tracks.find(t => t.id === id)
    },

    getSectionData (id) {
      const index = data.index.findIndex(s => s.id === id)
      return data.sections[index]
    }
  }
}
