
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const supabase = await createClient()
    const { id } = await params

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1. Fetch original profile
    const { data: originalProfile, error: profileError } = await supabase
        .from('label_profiles')
        .select('*')
        .eq('id', id)
        .single()

    if (profileError || !originalProfile) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // 2. Fetch original configs
    const { data: originalConfigs, error: configsError } = await supabase
        .from('label_configs')
        .select('*')
        .eq('profile_id', id)

    if (configsError) {
        return NextResponse.json({ error: 'Error fetching configs' }, { status: 500 })
    }

    // 3. Generate new name
    const baseName = originalProfile.name
    // Find all profiles that start with this name to determine suffix
    const { data: existingProfiles } = await supabase
        .from('label_profiles')
        .select('name')
        .ilike('name', `${baseName}%`)

    let newName = `${baseName} (Copia)`
    if (existingProfiles && existingProfiles.length > 0) {
        const names = existingProfiles.map(p => p.name)
        if (names.includes(newName)) {
            let counter = 2
            while (names.includes(`${baseName} (Copia ${counter})`)) {
                counter++
            }
            newName = `${baseName} (Copia ${counter})`
        }
    }

    // 4. Create new profile
    const { data: newProfile, error: createError } = await supabase
        .from('label_profiles')
        .insert({
            name: newName,
            org_id: originalProfile.org_id,
            is_default: false, // Never copy default status
        })
        .select()
        .single()

    if (createError || !newProfile) {
        return NextResponse.json({ error: createError?.message || 'Error creating profile' }, { status: 500 })
    }

    // 5. Duplicate configs
    if (originalConfigs && originalConfigs.length > 0) {
        const newConfigs = originalConfigs.map(config => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id, profile_id, created_at, ...rest } = config
            return {
                ...rest,
                profile_id: newProfile.id
            }
        })

        const { error: bulkError } = await supabase
            .from('label_configs')
            .insert(newConfigs)

        if (bulkError) {
            // Rollback profile (optional but good practice)
            await supabase.from('label_profiles').delete().eq('id', newProfile.id)
            return NextResponse.json({ error: bulkError.message }, { status: 500 })
        }
    }

    return NextResponse.json({
        success: true,
        newProfileId: newProfile.id,
        newProfileName: newProfile.name
    })
}
