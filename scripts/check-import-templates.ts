
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://nvgeotajzmaldsrodlby.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52Z2VvdGFqem1hbGRzcm9kbGJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NDQzODksImV4cCI6MjA4NjMyMDM4OX0.S5PiyABd0xHCtBr0CnfbASqVorXawRJH07oA3emO04k'

async function check() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    console.log('Checking import_templates table...')

    // Try to select just one row
    const { data, error } = await supabase
        .from('import_templates')
        .select('id')
        .limit(1)

    if (error) {
        console.error('Error querying import_templates:', error)
        if (error.code === '42P01') {
            console.error('Table import_templates DOES NOT EXIST')
        } else if (error.code === '42501') {
            console.error('Table exists but RLS denied access (expected for anon)')
        }
    } else {
        console.log('Table exists and is readable (unexpected for anon unless public). Data:', data)
    }
}

check()
