package fleaflicker

import (
	"encoding/json"
	"os"
	"time"
)

type Cache struct {
	LeagueID int            `json:"league_id"`
	Sport    string         `json:"sport"`
	SyncedAt time.Time      `json:"synced_at"`
	Items    []ActivityItem `json:"items"`
}

// SaveCache writes the transaction items to a local JSON cache file
func SaveCache(filename string, leagueID int, sport string, items []ActivityItem) error {
	cache := Cache{
		LeagueID: leagueID,
		Sport:    sport,
		SyncedAt: time.Now(),
		Items:    items,
	}

	data, err := json.MarshalIndent(cache, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(filename, data, 0644)
}

// LoadCache reads the transaction items from the local JSON cache file
func LoadCache(filename string) (*Cache, error) {
	data, err := os.ReadFile(filename)
	if err != nil {
		return nil, err
	}

	var cache Cache
	if err := json.Unmarshal(data, &cache); err != nil {
		return nil, err
	}

	return &cache, nil
}
