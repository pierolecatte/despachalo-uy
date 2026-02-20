
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://nvgeotajzmaldsrodlby.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52Z2VvdGFqem1hbGRzcm9kbGJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NDQzODksImV4cCI6MjA4NjMyMDM4OX0.S5PiyABd0xHCtBr0CnfbASqVorXawRJH07oA3emO04k'

async function inspect() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    console.log('Inspecting import_templates table...')

    // Attempt to select specific columns to see if they error out
    const { data, error } = await supabase
        .from('import_templates')
        .select('id, name, header_signature_strict, header_signature_loose')
        .limit(1)

    if (error) {
        console.error('Error selecting columns:', error)
    } else {
        console.log('Successfully selected columns. Data:', data)
    }
}

inspect()
