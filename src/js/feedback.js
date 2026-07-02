document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('feedback-form');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const ratingInput = form.querySelector('input[name="feedback-rating"]:checked');
    if (!ratingInput) {
      alert('Please select how satisfied you are with Uprise University.');
      return;
    }

    const detailsEl = document.getElementById('feedback-details');
    const details = detailsEl ? detailsEl.value.trim() : '';
    const submitBtn = document.getElementById('feedback-submit');
    const errorEl = document.getElementById('feedback-error');

    if (errorEl) {
      errorEl.style.display = 'none';
      errorEl.textContent = '';
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
    }

    const payload = {
      details: details || null,
      rating: Number(ratingInput.value)
    };

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.status === 503) {
        throw new Error(
          'Feedback is not available yet. Please ensure Supabase is configured and the feedback table exists.'
        );
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to submit feedback');
      }

      alert('Thank you for your feedback! We appreciate you helping us improve Uprise University.');
      window.location.href = '/index.html';
    } catch (err) {
      console.error(err);
      if (errorEl) {
        errorEl.textContent = err.message || 'Something went wrong. Please try again.';
        errorEl.style.display = 'block';
      } else {
        alert(err.message || 'Something went wrong. Please try again.');
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
      }
    }
  });
});
