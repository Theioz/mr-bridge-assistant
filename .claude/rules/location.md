# Location Management

Weather location is resolved from the profile table in this order:
1. `location_lat` + `location_lon` (explicit coordinates)
2. `location_city` (geocoded — overrides Identity/Location)
3. `Identity/Location` (geocoded — default fallback)

## Changing location in chat
When the user says anything like "change my location to X", "set weather to X", "I'm traveling to X", or "use X for weather":

```python
python3 - <<'EOF'
import sys
sys.path.insert(0, "scripts")
from _supabase import get_client, get_owner_user_id
client = get_client()
uid = get_owner_user_id()
client.table("profile").upsert({"user_id": uid, "key": "location_city", "value": "<CITY>"}, on_conflict="user_id,key").execute()
print("Location updated.")
EOF
```

Confirm: "Weather location set to [city]. Revert with 'reset my location'."

## Resetting to home location
When the user says "reset my location", "back home", "use my home location", or similar:

```python
python3 - <<'EOF'
import sys
sys.path.insert(0, "scripts")
from _supabase import get_client, get_owner_user_id
client = get_client()
uid = get_owner_user_id()
client.table("profile").delete().eq("user_id", uid).eq("key", "location_city").execute()
print("Location reset.")
EOF
```

Confirm: "Weather location reset. Using Identity/Location ([value]) as default."