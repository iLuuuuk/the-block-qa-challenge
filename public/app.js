(function () {
  const path = window.location.pathname;

  async function fetchJson(url, options) {
    const res = await fetch(url, options);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = body.error || `Request failed: ${res.status}`;
      throw new Error(message);
    }
    return body;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(value);
  }

  async function renderInventory() {
    const listNode = document.getElementById('list');
    const statusNode = document.getElementById('status');
    const searchNode = document.getElementById('search');
    const bodyStyleNode = document.getElementById('bodyStyle');
    const reloadButton = document.getElementById('reload');

    async function load() {
      statusNode.textContent = 'Loading vehicles...';
      const q = encodeURIComponent(searchNode.value.trim());
      const bodyStyle = encodeURIComponent(bodyStyleNode.value);
      const response = await fetchJson(`/api/vehicles?q=${q}&bodyStyle=${bodyStyle}`);
      const items = response.data || [];

      if (!items.length) {
        listNode.innerHTML = '';
        statusNode.textContent = 'No vehicles found.';
        return;
      }

      listNode.innerHTML = items
        .map(
          (v) =>
            `<li>
              <h3>${v.title}</h3>
              <p class="muted">${v.year} • ${v.bodyStyle} • ${v.location}</p>
              <p>Current bid: <strong>${formatCurrency(v.currentBid)}</strong> (${v.bidCount} bids)</p>
              <p><a href="/vehicle.html?id=${encodeURIComponent(v.id)}">Open details</a></p>
            </li>`
        )
        .join('');

      statusNode.textContent = `${items.length} vehicle(s)`;
    }

    searchNode.addEventListener('input', () => {
      load().catch((err) => {
        statusNode.textContent = err.message;
      });
    });

    bodyStyleNode.addEventListener('change', () => {
      load().catch((err) => {
        statusNode.textContent = err.message;
      });
    });

    reloadButton.addEventListener('click', () => {
      load().catch((err) => {
        statusNode.textContent = err.message;
      });
    });

    await load();
  }

  async function renderVehicle() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const title = document.getElementById('title');
    const meta = document.getElementById('meta');
    const price = document.getElementById('price');
    const damage = document.getElementById('damage');
    const bidder = document.getElementById('bidder');
    const amount = document.getElementById('amount');
    const placeBid = document.getElementById('placeBid');
    const status = document.getElementById('status');

    if (!id) {
      title.textContent = 'Vehicle not found';
      return;
    }

    async function loadVehicle() {
      const response = await fetchJson(`/api/vehicles/${encodeURIComponent(id)}`);
      const v = response.data;
      title.textContent = v.title;
      meta.textContent = `${v.year} ${v.make} ${v.model} • ${v.dealer} • ${v.location}`;
      price.textContent = `Current bid: ${formatCurrency(v.currentBid)} (${v.bidCount} bids)`;
      damage.textContent = `Condition: ${v.condition}. Notes: ${v.damageNotes}`;
    }

    placeBid.addEventListener('click', async () => {
      status.textContent = 'Submitting bid...';
      try {
        await fetchJson(`/api/vehicles/${encodeURIComponent(id)}/bids`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bidder: bidder.value, amount: Number(amount.value) })
        });
        status.textContent = 'Bid accepted.';
        await loadVehicle();
      } catch (err) {
        status.textContent = err.message;
      }
    });

    await loadVehicle();
  }

  if (path.endsWith('/vehicle.html')) {
    renderVehicle().catch((err) => {
      const status = document.getElementById('status');
      if (status) {
        status.textContent = err.message;
      }
    });
  } else {
    renderInventory().catch((err) => {
      const status = document.getElementById('status');
      if (status) {
        status.textContent = err.message;
      }
    });
  }
})();
