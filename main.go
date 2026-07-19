package main

import (
	"flag"
	"fmt"
	"os"

	"FleaflickerGemini/fleaflicker"
)

func printUsage() {
	fmt.Println("Usage: fleaflicker-cli [options] <command>")
	fmt.Println("\nCommands:")
	fmt.Println("  standings      Fetch and display league standings")
	fmt.Println("  rosters        Fetch and display rosters for all teams in the league")
	fmt.Println("  activity       Fetch and display recent league transactions")
	fmt.Println("  pickups        Fetch all transactions and show pickup count per team")
	fmt.Println("  sync           Download and cache full transaction history locally")
	fmt.Println("  stats          Analyze and display transaction statistics from local cache")
	fmt.Println("\nOptions:")
	flag.PrintDefaults()
}

func main() {
	sportFlag := flag.String("sport", "NFL", "Sport type (NFL, MLB, NBA, NHL)")
	leagueFlag := flag.Int("league", 111626, "Fleaflicker League ID (default is 111626)")
	seasonFlag := flag.Int("season", 0, "Year/Season to fetch (default is current season)")
	yearFlag := flag.Int("year", 0, "Filter stats by year")
	dateFlag := flag.String("date", "", "Filter stats by date (YYYY-MM-DD)")
	teamFlag := flag.String("team", "", "Filter stats by team name")
	cacheFlag := flag.String("cache", "transactions_cache.json", "Local cache file path")

	flag.Usage = printUsage
	flag.Parse()

	args := flag.Args()
	if len(args) < 1 {
		fmt.Println("Error: command required")
		printUsage()
		os.Exit(1)
	}

	command := args[0]
	client := fleaflicker.NewClient(fleaflicker.Sport(*sportFlag), *leagueFlag, *seasonFlag)

	switch command {
	case "standings":
		standings, err := client.FetchStandings()
		if err != nil {
			fmt.Printf("Error fetching standings: %v\n", err)
			os.Exit(1)
		}
		fleaflicker.PrintStandings(standings)

	case "rosters":
		rosters, err := client.FetchRosters()
		if err != nil {
			fmt.Printf("Error fetching rosters: %v\n", err)
			os.Exit(1)
		}
		fleaflicker.PrintRosters(rosters)

	case "activity":
		activity, err := client.FetchActivity()
		if err != nil {
			fmt.Printf("Error fetching activity: %v\n", err)
			os.Exit(1)
		}
		fleaflicker.PrintActivity(activity)

	case "pickups":
		fleaflicker.PrintPickups(client)

	case "sync":
		fleaflicker.SyncTransactions(client, *cacheFlag)

	case "stats":
		fleaflicker.PrintStats(*cacheFlag, *yearFlag, *dateFlag, *teamFlag)

	default:
		fmt.Printf("Error: unknown command %q\n", command)
		printUsage()
		os.Exit(1)
	}
}
