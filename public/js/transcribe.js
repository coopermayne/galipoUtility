document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
  
    socket.on('transcribeStatus', (status) => {
    });
  
    socket.on('transcribeResult', (transcription) => {
    });
  });