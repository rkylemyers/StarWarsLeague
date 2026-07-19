package fleaflicker

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

type Client struct {
	BaseURL  string
	Sport    Sport
	LeagueID int
	Season   int
}

func NewClient(sport Sport, leagueID int, season int) *Client {
	return &Client{
		BaseURL:  "https://www.fleaflicker.com/api",
		Sport:    sport,
		LeagueID: leagueID,
		Season:   season,
	}
}

func (c *Client) FetchStandings() (*StandingsResponse, error) {
	u, err := url.Parse(fmt.Sprintf("%s/FetchLeagueStandings", c.BaseURL))
	if err != nil {
		return nil, err
	}

	q := u.Query()
	q.Set("sport", string(c.Sport))
	q.Set("league_id", fmt.Sprintf("%d", c.LeagueID))
	if c.Season > 0 {
		q.Set("season", fmt.Sprintf("%d", c.Season))
	}
	u.RawQuery = q.Encode()

	resp, err := http.Get(u.String())
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var data StandingsResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	return &data, nil
}

func (c *Client) FetchRosters() (*RostersResponse, error) {
	u, err := url.Parse(fmt.Sprintf("%s/FetchLeagueRosters", c.BaseURL))
	if err != nil {
		return nil, err
	}

	q := u.Query()
	q.Set("sport", string(c.Sport))
	q.Set("league_id", fmt.Sprintf("%d", c.LeagueID))
	if c.Season > 0 {
		q.Set("season", fmt.Sprintf("%d", c.Season))
	}
	u.RawQuery = q.Encode()

	resp, err := http.Get(u.String())
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var data RostersResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	return &data, nil
}

func (c *Client) FetchActivity() (*ActivityResponse, error) {
	u, err := url.Parse(fmt.Sprintf("%s/FetchLeagueActivity", c.BaseURL))
	if err != nil {
		return nil, err
	}

	q := u.Query()
	q.Set("sport", string(c.Sport))
	q.Set("league_id", fmt.Sprintf("%d", c.LeagueID))
	if c.Season > 0 {
		q.Set("season", fmt.Sprintf("%d", c.Season))
	}
	u.RawQuery = q.Encode()

	resp, err := http.Get(u.String())
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var data ActivityResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	return &data, nil
}

func (c *Client) FetchTransactions(offset int) (*ActivityResponse, error) {
	u, err := url.Parse(fmt.Sprintf("%s/FetchLeagueTransactions", c.BaseURL))
	if err != nil {
		return nil, err
	}

	q := u.Query()
	q.Set("sport", string(c.Sport))
	q.Set("league_id", fmt.Sprintf("%d", c.LeagueID))
	if c.Season > 0 {
		q.Set("season", fmt.Sprintf("%d", c.Season))
	}
	if offset > 0 {
		q.Set("result_offset", fmt.Sprintf("%d", offset))
	}
	u.RawQuery = q.Encode()

	maxRetries := 6
	backoff := 3 * time.Second

	for i := 0; i < maxRetries; i++ {
		resp, err := http.Get(u.String())
		if err != nil {
			if i == maxRetries-1 {
				return nil, err
			}
			time.Sleep(backoff)
			backoff *= 2
			continue
		}

		if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusTooManyRequests {
			resp.Body.Close()
			if i == maxRetries-1 {
				return nil, fmt.Errorf("rate limited: status code %d", resp.StatusCode)
			}
			fmt.Printf("\n[Rate Limited: HTTP %d] Sleeping %v before retry...\n", resp.StatusCode, backoff)
			time.Sleep(backoff)
			backoff *= 2
			continue
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
		}

		var data ActivityResponse
		err = json.NewDecoder(resp.Body).Decode(&data)
		resp.Body.Close()
		if err != nil {
			return nil, err
		}

		return &data, nil
	}

	return nil, fmt.Errorf("max retries reached")
}
