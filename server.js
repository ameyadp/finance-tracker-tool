const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// --- In-Memory "Database" (resets when the server restarts) ---
let transactions = [];
let nextTransactionId = 1;

// Sample data. Positive amounts are assets, negative amounts are liabilities.
let networthItems = [
    { id: 1, description: 'Checking Account', amount: 5000 },
    { id: 2, description: 'Brokerage Account', amount: 12000 },
    { id: 3, description: 'Credit Card', amount: -1500 },
    { id: 4, description: 'Student Loan', amount: -20000 }
];
let nextItemId = 5;

// --- Validation helpers ---
const isValidDescription = (value) => typeof value === 'string' && value.trim() !== '';
const isValidAmount = (value) => typeof value === 'number' && Number.isFinite(value);

// --- HTML Page Routes ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/networth', (req, res) => res.sendFile(path.join(__dirname, 'networth.html')));

// --- Transactions API ---
app.get('/api/transactions', (req, res) => res.json(transactions));

app.post('/api/transactions', (req, res) => {
    const { description, amount, type } = req.body;

    if (!isValidDescription(description) || !isValidAmount(amount) || !['income', 'expense'].includes(type)) {
        return res.status(400).json({ message: 'description, a numeric amount, and type (income or expense) are required' });
    }

    const transaction = { id: nextTransactionId++, description: description.trim(), amount, type };
    transactions.push(transaction);
    res.status(201).json(transaction);
});

// --- Net Worth API ---
app.get('/api/networth-items', (req, res) => res.json(networthItems));

app.post('/api/networth-items', (req, res) => {
    const { description, amount } = req.body;

    if (!isValidDescription(description) || !isValidAmount(amount)) {
        return res.status(400).json({ message: 'description and a numeric amount are required' });
    }

    const newItem = { id: nextItemId++, description: description.trim(), amount };
    networthItems.push(newItem);
    res.status(201).json(newItem);
});

app.put('/api/networth-items/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { description, amount } = req.body;
    const itemIndex = networthItems.findIndex(item => item.id === id);

    if (itemIndex === -1) {
        return res.status(404).json({ message: 'Item not found' });
    }
    if (!isValidDescription(description) || !isValidAmount(amount)) {
        return res.status(400).json({ message: 'description and a numeric amount are required' });
    }

    networthItems[itemIndex] = { ...networthItems[itemIndex], description: description.trim(), amount };
    res.json(networthItems[itemIndex]);
});

app.delete('/api/networth-items/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    networthItems = networthItems.filter(item => item.id !== id);
    res.status(204).send();
});

app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));
