import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

interface SearchBoxProps {
    placeholder?: string;
    onSearch?: (query: string) => void;
}

export function SearchBox({ placeholder = 'ENTER QUERY...', onSearch }: SearchBoxProps) {
    const [query, setQuery] = useState('');
    const navigate = useNavigate();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            if (onSearch) {
                onSearch(query);
            } else {
                navigate(`/search?q=${encodeURIComponent(query)}`);
            }
        }
    };

    return (
        <form onSubmit={handleSubmit} className="search-form" style={{ width: '100%' }}>
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                className="search-input"
                style={{ flex: 1, border: '2px solid var(--text-dark)' }}
            />
            <button type="submit" className="search-button">Execute Request</button>
        </form>
    );
}