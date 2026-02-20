
import { useState, useEffect, useCallback } from 'react';

export interface Department {
    id: number;
    name: string;
    code: string | null;
}

export interface Locality {
    id: number;
    name: string;
    departamento_id: number;
}

export function useDepartments() {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchDepartments() {
            try {
                const res = await fetch('/api/departments');
                if (!res.ok) throw new Error('Failed to fetch departments');
                const data = await res.json();
                setDepartments(data);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchDepartments();
    }, []);

    return { departments, loading, error };
}

export function useLocalities(departmentId: number | string | null) {
    const [localities, setLocalities] = useState<Locality[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!departmentId) {
            setLocalities([]);
            return;
        }

        async function fetchLocalities() {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/localities?department_id=${departmentId}`);
                if (!res.ok) throw new Error('Failed to fetch localities');
                const data = await res.json();
                setLocalities(data);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        fetchLocalities();
    }, [departmentId]);

    return { localities, loading, error };
}

export interface LocalitySearchResult {
    id: number;
    name: string;
    department_id: number;
    department_name: string;
}

export function useLocalitySearch() {
    const [results, setResults] = useState<LocalitySearchResult[]>([]);
    const [loading, setLoading] = useState(false);

    // Use useCallback to keep function reference stable and prevent effect loops
    const search = useCallback(async (query: string) => {
        if (!query || query.trim().length < 2) {
            setResults([]);
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`/api/localities/search?q=${encodeURIComponent(query)}`);
            if (res.ok) {
                const data = await res.json();
                setResults(data);
            } else {
                setResults([]);
            }
        } catch (error) {
            console.error(error);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const clearResults = useCallback(() => setResults([]), []);

    return { results, loading, search, clearResults };
}
