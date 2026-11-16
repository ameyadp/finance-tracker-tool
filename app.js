document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('transaction-form');
    const tableBody = document.querySelector('#transaction-table tbody');
    const API_URL = '/api/transactions';

    function addTransactionToTable({ description, amount, type }) {
        const row = tableBody.insertRow();
        row.insertCell(0).textContent = description;
        row.insertCell(1).textContent = `$${amount.toFixed(2)}`;
        row.insertCell(2).textContent = type;
        // Green for income, red for expense
        row.classList.add(type);
    }

    // Load transactions already saved on the server
    async function loadTransactions() {
        try {
            const response = await fetch(API_URL);
            const transactions = await response.json();
            tableBody.innerHTML = '';
            transactions.forEach(addTransactionToTable);
        } catch (error) {
            console.error('Could not load transactions:', error);
        }
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const description = document.getElementById('description').value;
        const amount = parseFloat(document.getElementById('amount').value);
        const type = document.getElementById('type').value;

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description, amount, type }),
            });
            if (!response.ok) throw new Error((await response.json()).message);

            // Only show the transaction once the server has saved it
            addTransactionToTable(await response.json());
            form.reset();
        } catch (error) {
            console.error('Could not save transaction:', error);
            alert('Could not save the transaction. Please try again.');
        }
    });

    loadTransactions();
});
