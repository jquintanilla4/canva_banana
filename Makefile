.PHONY: help dev web-dev desktop-dev dev-backends backend-dev secure-backend-dev

help:
	@printf '%s\n' \
		'Available targets:' \
		'  make dev           Start the web app only.' \
		'  make desktop-dev   Start Electron plus local services.' \
		'  make dev-backends  Start the Node backend and Seedance backend together.' \
		'  make web-dev       Start the Vite frontend only.' \
		'  make backend-dev   Start the Seedance backend only.' \
		'  make secure-backend-dev Start the secure Node backend only.'

web-dev:
	@npm run dev:web

desktop-dev:
	@npm run dev:desktop

backend-dev:
	@npm run backend:dev

secure-backend-dev:
	@npm run secure-backend:dev

dev:
	@npm run dev:web

dev-backends:
	@command -v npm >/dev/null 2>&1 || { echo "Missing npm. Install Node.js/npm first."; exit 1; }; \
	command -v uv >/dev/null 2>&1 || { echo "Missing uv. Install uv first."; exit 1; }; \
	test -d node_modules || { echo "Missing node_modules. Run npm install."; exit 1; }; \
	test -d apps/python-backend/backend/.venv || { echo "Missing apps/python-backend/backend/.venv. Run npm -w @canva-banana/python-backend run sync."; exit 1; }; \
	backend_pid=''; \
	secure_backend_pid=''; \
	cleanup() { \
		status=$$?; \
		trap - INT TERM EXIT; \
		if [ -n "$$secure_backend_pid" ] && kill -0 "$$secure_backend_pid" 2>/dev/null; then kill "$$secure_backend_pid" 2>/dev/null || true; fi; \
		if [ -n "$$backend_pid" ] && kill -0 "$$backend_pid" 2>/dev/null; then kill "$$backend_pid" 2>/dev/null || true; fi; \
		wait "$$secure_backend_pid" 2>/dev/null || true; \
		wait "$$backend_pid" 2>/dev/null || true; \
		exit $$status; \
	}; \
	trap 'cleanup' INT TERM EXIT; \
	echo "Starting secure Node backend on http://localhost:8787"; \
	npm run secure-backend:dev & \
	secure_backend_pid=$$!; \
	sleep 1; \
	if ! kill -0 "$$secure_backend_pid" 2>/dev/null; then \
		echo "Secure Node backend failed to start. Check the logs above."; \
		wait "$$secure_backend_pid"; \
		exit $$?; \
	fi; \
	echo "Starting Seedance backend on http://localhost:8000"; \
	npm run backend:dev & \
	backend_pid=$$!; \
	sleep 2; \
	if ! kill -0 "$$backend_pid" 2>/dev/null; then \
		echo "Backend failed to start. Check the logs above."; \
		wait "$$backend_pid"; \
		exit $$?; \
	fi; \
	while :; do \
		if ! kill -0 "$$secure_backend_pid" 2>/dev/null; then \
			wait "$$secure_backend_pid"; \
			exit $$?; \
		fi; \
		if ! kill -0 "$$backend_pid" 2>/dev/null; then \
			wait "$$backend_pid"; \
			exit $$?; \
		fi; \
		sleep 1; \
	done
