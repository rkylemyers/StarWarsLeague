package fleaflicker

import (
	"fmt"
	"os"
	"sort"
	"strconv"
	"text/tabwriter"
	"time"
)

// PrintStandings formats and prints the league standings in a tabular layout
func PrintStandings(standings *StandingsResponse) {
	fmt.Printf("League: %s (%d)\n", standings.League.Name, standings.Season)
	fmt.Println("==========================================================================================")

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
	fmt.Fprintln(w, "Rank\tTeam Name\tRecord\tPct\tPoints For\tPoints Agst\tStreak\tWaiver\tBudget")
	fmt.Fprintln(w, "----\t---------\t------\t---\t----------\t-----------\t------\t------\t------")

	for _, div := range standings.Divisions {
		for _, team := range div.Teams {
			fmt.Fprintf(w, "%d\t%s\t%s\t%s\t%s\t%s\t%s\t%d\t%s\n",
				team.RecordOverall.Rank,
				team.Name,
				team.RecordOverall.Formatted,
				team.RecordOverall.WinPercentage.Formatted,
				team.PointsFor.Formatted,
				team.PointsAgainst.Formatted,
				team.Streak.Formatted,
				team.WaiverPosition,
				team.WaiverAcquisitionBudget.Formatted,
			)
		}
	}
	w.Flush()
}

// PrintRosters formats and prints the rosters for each team in the league
func PrintRosters(rosters *RostersResponse) {
	for _, r := range rosters.Rosters {
		fmt.Printf("\nTeam: %s\n", r.Team.Name)
		fmt.Println("==========================================================================================")
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "Player Name\tPos\tNFL Team\tBye")
		fmt.Fprintln(w, "-----------\t---\t--------\t---")
		for _, p := range r.Players {
			if p.ProPlayer.ID == 0 {
				continue
			}
			fmt.Fprintf(w, "%s\t%s\t%s\t%d\n",
				p.ProPlayer.NameFull,
				p.ProPlayer.Position,
				p.ProPlayer.ProTeamAbbreviation,
				p.ProPlayer.ByeWeek,
			)
		}
		w.Flush()
	}
}

// PrintActivity formats and prints the league activity log in a tabular layout
func PrintActivity(activity *ActivityResponse) {
	fmt.Println("Recent League Activity:")
	fmt.Println("==========================================================================================")

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
	fmt.Fprintln(w, "Date/Time\tTeam Name\tAction\tPlayer Details")
	fmt.Fprintln(w, "---------\t---------\t------\t--------------")

	for _, item := range activity.Items {
		milli, err := strconv.ParseInt(item.TimeEpochMilli, 10, 64)
		timeStr := item.TimeEpochMilli
		if err == nil {
			t := time.UnixMilli(milli)
			timeStr = t.Format("2006-01-02 15:04")
		}

		if item.Transaction != nil {
			action := item.Transaction.Type
			switch action {
			case "TRANSACTION_CLAIM":
				action = "Claim"
			case "TRANSACTION_DROP":
				action = "Drop"
			case "TRANSACTION_ADD":
				action = "Add"
			}
			fmt.Fprintf(w, "%s\t%s\t%s\t%s (%s, %s)\n",
				timeStr,
				item.Transaction.Team.Name,
				action,
				item.Transaction.Player.ProPlayer.NameFull,
				item.Transaction.Player.ProPlayer.Position,
				item.Transaction.Player.ProPlayer.ProTeamAbbreviation,
			)
		} else if item.ReserveChange != nil {
			action := "Reserve Add"
			if item.ReserveChange.Removed {
				action = "Reserve Remove"
			}
			fmt.Fprintf(w, "%s\t%s\t%s\t%s (%s, %s)\n",
				timeStr,
				item.ReserveChange.Team.Name,
				action,
				item.ReserveChange.Player.ProPlayer.NameFull,
				item.ReserveChange.Player.ProPlayer.Position,
				item.ReserveChange.Player.ProPlayer.ProTeamAbbreviation,
			)
		}
	}
	w.Flush()
}

type TeamPickup struct {
	TeamName string
	Count    int
}

// PrintPickups calculates and prints the number of player pickups per team
func PrintPickups(client *Client) {
	fmt.Printf("Fetching transaction history for League %d...\n", client.LeagueID)

	pickupCounts := make(map[string]int)
	offset := 0
	page := 1

	for {
		fmt.Printf("Fetching page %d...\r", page)
		resp, err := client.FetchTransactions(offset)
		if err != nil {
			fmt.Printf("\nError fetching transactions at offset %d: %v\n", offset, err)
			return
		}

		if len(resp.Items) == 0 {
			break
		}

		for _, item := range resp.Items {
			if item.Transaction != nil {
				// Pickups are transaction types that are NOT drops.
				if item.Transaction.Type != "TRANSACTION_DROP" {
					teamName := item.Transaction.Team.Name
					if teamName != "" {
						pickupCounts[teamName]++
					}
				}
			}
		}

		if resp.ResultOffsetNext > 0 && resp.ResultOffsetNext != offset {
			offset = resp.ResultOffsetNext
			page++
			time.Sleep(150 * time.Millisecond)
		} else {
			break
		}
	}
	fmt.Println("\nDone.")
	fmt.Println("==========================================================================================")
	fmt.Println("Pickups per Team (All-Time Transaction History):")
	fmt.Println("==========================================================================================")

	var list []TeamPickup
	for name, count := range pickupCounts {
		list = append(list, TeamPickup{TeamName: name, Count: count})
	}

	// Sort by count descending, then by name alphabetically
	sort.Slice(list, func(i, j int) bool {
		if list[i].Count == list[j].Count {
			return list[i].TeamName < list[j].TeamName
		}
		return list[i].Count > list[j].Count
	})

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
	fmt.Fprintln(w, "Rank\tTeam Name\tPickups")
	fmt.Fprintln(w, "----\t---------\t-------")
	for rank, tp := range list {
		fmt.Fprintf(w, "%d\t%s\t%d\n", rank+1, tp.TeamName, tp.Count)
	}
	w.Flush()
}

// SyncTransactions downloads the entire history and saves it to a cache file
func SyncTransactions(client *Client, cacheFile string) {
	fmt.Printf("Syncing transaction history for League %d from API...\n", client.LeagueID)

	var allItems []ActivityItem
	offset := 0
	page := 1

	for {
		fmt.Printf("Fetching page %d...\r", page)
		resp, err := client.FetchTransactions(offset)
		if err != nil {
			fmt.Printf("\nError fetching transactions at offset %d: %v\n", offset, err)
			return
		}

		if len(resp.Items) == 0 {
			break
		}

		allItems = append(allItems, resp.Items...)

		if resp.ResultOffsetNext > 0 && resp.ResultOffsetNext != offset {
			offset = resp.ResultOffsetNext
			page++
			time.Sleep(150 * time.Millisecond)
		} else {
			break
		}
	}
	fmt.Println("\nDone fetching.")

	// Identify unique years/seasons from transaction items
	yearsMap := make(map[string]bool)
	
	// Always include the current active season year
	curYear := time.Now().Year()
	if time.Now().Month() < time.May {
		curYear--
	}
	yearsMap[strconv.Itoa(curYear)] = true

	for _, item := range allItems {
		milli, err := strconv.ParseInt(item.TimeEpochMilli, 10, 64)
		if err == nil {
			t := time.UnixMilli(milli)
			yearVal := t.Year()
			if t.Month() < time.May {
				yearVal--
			}
			yearsMap[strconv.Itoa(yearVal)] = true
		}
	}

	// Fetch standings for each unique year/season
	standingsMap := make(map[string]*StandingsResponse)
	originalSeason := client.Season
	for yearStr := range yearsMap {
		fmt.Printf("Fetching standings for season %s...\n", yearStr)
		yearInt, _ := strconv.Atoi(yearStr)
		client.Season = yearInt

		standings, err := client.FetchStandings()
		if err != nil {
			fmt.Printf("Warning: failed to fetch standings for season %s: %v\n", yearStr, err)
			continue
		}
		standingsMap[yearStr] = standings
		time.Sleep(150 * time.Millisecond) // Rate limit safety
	}
	client.Season = originalSeason // Restore client season config

	err := SaveCache(cacheFile, client.LeagueID, string(client.Sport), allItems, standingsMap)
	if err != nil {
		fmt.Printf("Error saving transactions to cache file %s: %v\n", cacheFile, err)
		return
	}
	fmt.Printf("Successfully saved %d transaction items and %d seasons standings to %s.\n", len(allItems), len(standingsMap), cacheFile)
}

type TransactionStats struct {
	TeamName     string
	Claims       int
	Adds         int
	Trades       int
	Imports      int
	Drafts       int
	Drops        int
	ReserveMoves int
	Total        int
}

// PrintStats loads cached transaction entries and aggregates statistics by type with date and team filtering
func PrintStats(cacheFile string, filterYear int, filterDate string, filterTeam string) {
	cache, err := LoadCache(cacheFile)
	if err != nil {
		fmt.Printf("Error loading cache file %s: %v\n(Hint: Run the 'sync' command first to create the local cache file.)\n", cacheFile, err)
		return
	}

	fmt.Printf("Analyzing local cache synced at %s\n", cache.SyncedAt.Format("2006-01-02 15:04:05"))

	// Print filters
	filterDesc := "Filters:"
	hasFilters := false
	if filterYear > 0 {
		filterDesc += fmt.Sprintf(" Year=%d", filterYear)
		hasFilters = true
	}
	if filterDate != "" {
		filterDesc += fmt.Sprintf(" Date=%s", filterDate)
		hasFilters = true
	}
	if filterTeam != "" {
		filterDesc += fmt.Sprintf(" Team=%s", filterTeam)
		hasFilters = true
	}
	if !hasFilters {
		filterDesc += " None (All-Time)"
	}
	fmt.Println(filterDesc)
	fmt.Println("==========================================================================================")

	statsMap := make(map[string]*TransactionStats)

	for _, item := range cache.Items {
		milli, err := strconv.ParseInt(item.TimeEpochMilli, 10, 64)
		if err != nil {
			continue
		}
		t := time.UnixMilli(milli)

		// Apply Year Filter
		if filterYear > 0 && t.Year() != filterYear {
			continue
		}

		// Apply Date Filter (YYYY-MM-DD)
		if filterDate != "" && t.Format("2006-01-02") != filterDate {
			continue
		}

		// Process transaction
		if item.Transaction != nil {
			teamName := item.Transaction.Team.Name
			if teamName == "" {
				continue
			}

			// Apply Team Filter
			if filterTeam != "" && teamName != filterTeam {
				continue
			}

			stats, ok := statsMap[teamName]
			if !ok {
				stats = &TransactionStats{TeamName: teamName}
				statsMap[teamName] = stats
			}

			stats.Total++
			actionType := item.Transaction.Type
			if actionType == "" {
				actionType = "TRANSACTION_ADD" // Default
			}

			switch actionType {
			case "TRANSACTION_CLAIM":
				stats.Claims++
			case "TRANSACTION_ADD":
				stats.Adds++
			case "TRANSACTION_DROP":
				stats.Drops++
			case "TRANSACTION_IMPORT":
				stats.Imports++
			case "TRANSACTION_DRAFT":
				stats.Drafts++
			case "TRANSACTION_TRADE":
				stats.Trades++
			}
		} else if item.ReserveChange != nil {
			teamName := item.ReserveChange.Team.Name
			if teamName == "" {
				continue
			}

			// Apply Team Filter
			if filterTeam != "" && teamName != filterTeam {
				continue
			}

			stats, ok := statsMap[teamName]
			if !ok {
				stats = &TransactionStats{TeamName: teamName}
				statsMap[teamName] = stats
			}

			stats.Total++
			stats.ReserveMoves++
		}
	}

	var list []TransactionStats
	for _, stats := range statsMap {
		list = append(list, *stats)
	}

	// Sort by total transactions descending
	sort.Slice(list, func(i, j int) bool {
		if list[i].Total == list[j].Total {
			return list[i].TeamName < list[j].TeamName
		}
		return list[i].Total > list[j].Total
	})

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "Team Name\tClaims\tAdds\tTrades\tImports\tDrafts\tDrops\tReserve\tTotal")
	fmt.Fprintln(w, "---------\t------\t----\t------\t-------\t------\t-----\t-------\t-----")

	for _, s := range list {
		fmt.Fprintf(w, "%s\t%d\t%d\t%d\t%d\t%d\t%d\t%d\t%d\n",
			s.TeamName,
			s.Claims,
			s.Adds,
			s.Trades,
			s.Imports,
			s.Drafts,
			s.Drops,
			s.ReserveMoves,
			s.Total,
		)
	}
	w.Flush()
}
