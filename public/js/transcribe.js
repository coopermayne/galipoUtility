document.addEventListener('DOMContentLoaded', () => {
    const statusElement = document.getElementById('status');
    const resultElement = document.getElementById('result');
  
    const socket = io();
  
    socket.on('transcribeStatus', (status) => {
      statusElement.textContent = status;
    });
  
    socket.on('transcribeResult', (transcription) => {
      resultElement.value = transcription;
    });
  });
  