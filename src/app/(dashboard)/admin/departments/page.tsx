'use client'

import { useState, useEffect, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

interface Department {
    id: number
    name: string
    code: string
    cities: { id: number; name: string }[]
}

export default function DepartmentsPage() {
    const [departments, setDepartments] = useState<Department[]>([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState<number | null>(null)
    const supabase = createClient()

    useEffect(() => {
        fetchDepartments()
    }, [])

    async function fetchDepartments() {
        setLoading(true)
        const { data } = await supabase
            .from('departments')
            .select('id, name, code, cities(id, name)')
            .order('name')

        setDepartments((data as unknown as Department[]) || [])
        setLoading(false)
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-zinc-50">Departamentos</h1>
                <p className="text-zinc-400 mt-1">
                    {departments.length} departamentos de Uruguay
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardContent className="py-4 text-center">
                        <div className="text-3xl font-bold text-zinc-50">{departments.length}</div>
                        <p className="text-xs text-zinc-500 mt-1">Departamentos</p>
                    </CardContent>
                </Card>
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardContent className="py-4 text-center">
                        <div className="text-3xl font-bold text-emerald-400">
                            {departments.reduce((acc, d) => acc + (d.cities?.length || 0), 0)}
                        </div>
                        <p className="text-xs text-zinc-500 mt-1">Ciudades / Localidades</p>
                    </CardContent>
                </Card>
            </div>

            {/* Table */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/80">
                <Table>
                    <TableHeader>
                        <TableRow className="border-zinc-800 hover:bg-transparent">
                            <TableHead className="text-zinc-400 w-[60px]">#</TableHead>
                            <TableHead className="text-zinc-400">Departamento</TableHead>
                            <TableHead className="text-zinc-400">Código</TableHead>
                            <TableHead className="text-zinc-400 text-right">Ciudades</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center text-zinc-500 py-10">
                                    Cargando...
                                </TableCell>
                            </TableRow>
                        ) : (
                            departments.map((dept, i) => (
                                <Fragment key={dept.id}>
                                    <TableRow
                                        className="border-zinc-800 hover:bg-zinc-800/30 cursor-pointer"
                                        onClick={() => setExpanded(expanded === dept.id ? null : dept.id)}
                                    >
                                        <TableCell className="text-zinc-500 text-sm">{i + 1}</TableCell>
                                        <TableCell className="font-medium text-zinc-200">
                                            🗺️ {dept.name}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="bg-zinc-800/50 text-zinc-400 border-zinc-700 font-mono">
                                                {dept.code}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                                {dept.cities?.length || 0} ciudades
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                    {expanded === dept.id && dept.cities && dept.cities.length > 0 && (
                                        <TableRow className="border-zinc-800">
                                            <TableCell colSpan={4} className="bg-zinc-800/20 py-3 px-8">
                                                <div className="flex flex-wrap gap-2">
                                                    {dept.cities.map(city => (
                                                        <span key={city.id} className="px-2.5 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                                                            {city.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </Fragment>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
