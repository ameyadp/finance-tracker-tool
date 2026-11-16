document.addEventListener('DOMContentLoaded', () => {
    const assetForm = document.getElementById('asset-form');
    const liabilityForm = document.getElementById('liability-form');
    const networthTableBody = document.querySelector('#networth-table tbody');
    const assetTableBody = document.querySelector('#asset-table tbody');
    const liabilityTableBody = document.querySelector('#liability-table tbody');

    // Summary display elements
    const totalAssetsDisplay = document.getElementById('total-assets');
    const totalLiabilitiesDisplay = document.getElementById('total-liabilities');
    const finalNetWorthDisplay = document.getElementById('final-net-worth');

    const API_URL = '/api/networth-items';

    // Assets and liabilities are shown without a sign; net worth keeps its sign.
    const formatCurrency = (amount) => `$${Math.abs(amount).toFixed(2)}`;
    const formatSignedCurrency = (amount) => `${amount < 0 ? '-' : ''}${formatCurrency(amount)}`;

    // Latest copy of each item from the server, keyed by id
    let itemsById = new Map();

    const addSimpleRow = (tbody, item) => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = item.description;
        row.insertCell(1).textContent = formatCurrency(item.amount);
    };

    const addItemRow = (item) => {
        const row = networthTableBody.insertRow();
        row.dataset.id = item.id;

        row.insertCell(0).textContent = item.description;
        const amountCell = row.insertCell(1);
        amountCell.textContent = formatCurrency(item.amount);
        amountCell.className = item.amount >= 0 ? 'positive' : 'negative';

        const actionsCell = row.insertCell(2);
        actionsCell.innerHTML = `
            <button class="edit-btn">Edit</button>
            <button class="delete-btn">Delete</button>
        `;
    };

    // Fetch all items and redraw the page
    const updateUI = async () => {
        const response = await fetch(API_URL);
        const items = await response.json();
        itemsById = new Map(items.map(item => [String(item.id), item]));

        networthTableBody.innerHTML = '';
        assetTableBody.innerHTML = '';
        liabilityTableBody.innerHTML = '';

        let totalAssets = 0;
        let totalLiabilities = 0;

        items.forEach(item => {
            addItemRow(item);
            if (item.amount >= 0) {
                totalAssets += item.amount;
                addSimpleRow(assetTableBody, item);
            } else {
                totalLiabilities += item.amount;
                addSimpleRow(liabilityTableBody, item);
            }
        });

        const netWorth = totalAssets + totalLiabilities;
        totalAssetsDisplay.textContent = formatCurrency(totalAssets);
        totalLiabilitiesDisplay.textContent = formatCurrency(totalLiabilities);
        finalNetWorthDisplay.textContent = formatSignedCurrency(netWorth);
        finalNetWorthDisplay.className = netWorth >= 0 ? 'positive' : 'negative';
    };

    const sendItem = async (url, method, item) => {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
        });
        if (!response.ok) {
            alert('Could not save the item. Please check the description and amount.');
        }
        await updateUI();
    };

    // Edit, Save and Delete buttons in the Items table
    networthTableBody.addEventListener('click', async (e) => {
        const row = e.target.closest('tr');
        if (!row) return;

        const id = row.dataset.id;
        const item = itemsById.get(id);

        if (e.target.classList.contains('edit-btn')) {
            // Switch the row to edit mode. Inputs are built with DOM methods,
            // so descriptions containing quotes or HTML are handled safely.
            const descInput = document.createElement('input');
            descInput.type = 'text';
            descInput.value = item.description;

            const amountInput = document.createElement('input');
            amountInput.type = 'number';
            amountInput.value = item.amount;

            row.cells[0].replaceChildren(descInput);
            row.cells[1].replaceChildren(amountInput);

            e.target.textContent = 'Save';
            e.target.classList.replace('edit-btn', 'save-btn');

        } else if (e.target.classList.contains('save-btn')) {
            const description = row.querySelector('input[type="text"]').value;
            const amount = parseFloat(row.querySelector('input[type="number"]').value);
            await sendItem(`${API_URL}/${id}`, 'PUT', { description, amount });

        } else if (e.target.classList.contains('delete-btn')) {
            if (confirm('Are you sure you want to delete this item?')) {
                await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
                await updateUI();
            }
        }
    });

    // Assets are stored as positive amounts
    assetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const description = document.getElementById('asset-description').value;
        const amount = Math.abs(parseFloat(document.getElementById('asset-amount').value));
        await sendItem(API_URL, 'POST', { description, amount });
        assetForm.reset();
    });

    // Liabilities are entered as positive numbers and stored as negative amounts
    liabilityForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const description = document.getElementById('liability-description').value;
        const amount = -Math.abs(parseFloat(document.getElementById('liability-amount').value));
        await sendItem(API_URL, 'POST', { description, amount });
        liabilityForm.reset();
    });

    // Initial load
    updateUI();
});
