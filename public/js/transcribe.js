document.getElementById('upload-form').addEventListener('submit', function(event) {
  event.preventDefault();

  const fileInput = document.getElementById('audio');
  const file = fileInput.files[0];

  const formData = new FormData();
  formData.append('audio', file);

  fetch('/transcribefile', {
    method: 'POST',
    body: formData
  })
  .then(response => response.json())
  .then(data => {
    console.log(data);
  })
  .catch(error => {
    console.error('Error:', error);
  });
});
