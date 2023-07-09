console.log('working')

// Get all word spans
const wordSpans = document.querySelectorAll('.transcription span[data-start-time]');

// Add click event listeners to each word span
wordSpans.forEach((span) => {
  span.addEventListener('click', () => {
    const startTime = parseFloat(span.dataset.startTime);
    const endTime = parseFloat(span.dataset.endTime);

    // Play the audio from the specified start time
    playAudio(startTime, endTime);
  });
});

// Function to play audio from a specific start time
function playAudio(startTime, endTime) {
  const audioPlayer = document.getElementById('audioPlayer');
  audioPlayer.currentTime = startTime;

  // Play the audio
  audioPlayer.play();
}
