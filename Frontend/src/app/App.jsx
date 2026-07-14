import "./App.css";
import { Editor } from "@monaco-editor/react";
import { MonacoBinding } from "y-monaco";
import { useRef, useMemo, useState, useEffect } from "react";
import * as Y from "yjs";
import { SocketIOProvider } from "y-socket.io";

function App() {
  const editorRef = useRef(null);
  const providerRef = useRef(null);
  const [username, setUsername] = useState(() => {
    return new URLSearchParams(window.location.search).get("username") || "";
  });
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);

  const ydoc = useMemo(() => new Y.Doc(), []);
  const yText = useMemo(() => ydoc.getText("monaco"), [ydoc]);

  const handleMount = (editor) => {
    editorRef.current = editor;

    new MonacoBinding(
      yText,
      editorRef.current.getModel(),
      new Set([editorRef.current]),
    );
  };

  const handleJoin = (e) => {
    e.preventDefault();
    setUsername(e.target.username.value);
    window.history.pushState({}, "", "?username=" + e.target.username.value);
  };

  useEffect(() => {
    if (!username) return;

    const provider = new SocketIOProvider("/", "monaco", ydoc, {
      autoConnect: true,
    });
    providerRef.current = provider;

    provider.awareness.setLocalStateField("user", {
      username,
      typing: false,
    });

    let typingTimeout;

    const handleTextChange = (_event, transaction) => {
      // Only broadcast "typing" for changes that originated on this
      // client. Remote edits synced in from other users also fire this
      // observer, and without this check every peer would flag itself
      // as typing whenever anyone typed.
      if (!transaction.local) return;

      provider.awareness.setLocalStateField("user", {
        username,
        typing: true,
      });

      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        provider.awareness.setLocalStateField("user", {
          username,
          typing: false,
        });
      }, 1000);
    };

    yText.observe(handleTextChange);

    const syncStates = () => {
      const states = Array.from(provider.awareness.getStates().values());

      setUsers(
        states
          .filter((state) => state.user && state.user.username)
          .map((state) => state.user),
      );

      setTypingUsers(
        states.filter(
          (state) => state.user?.typing && state.user.username !== username,
        ),
      );
    };

    syncStates();

    provider.awareness.on("change", syncStates);

    function handleBeforeUnload() {
      provider.awareness.setLocalStateField("user", null);
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      yText.unobserve(handleTextChange);
      clearTimeout(typingTimeout);
      provider.awareness.off("change", syncStates);
      provider.disconnect();
      providerRef.current = null;
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [username, ydoc, yText]);

  if (!username) {
    return (
      <main className="h-screen w-full bg-blue-300 flex gap-4 p-4 items-center justify-center">
        <div className="">
          <h1 className="flex items-center text-xl font-bold italic justify-center my-6">
            ENTER YOUR USERNAME
          </h1>
          <form
            onSubmit={handleJoin}
            className="flex flex-col gap-4 border p-6 rounded-xl shadow-2xl bg-white"
          >
            <input
              type="text"
              placeholder="Enter your username"
              className="p-3 w-60 rounded-lg  text-gray-800 border border-gray-400"
              name="username"
            />
            <button className="p-2 rounded-lg bg-green-300 text-gray-950 font-bold">
              Join
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen w-full bg-blue-300 flex gap-2 p-3">
      <aside className="h-full w-1/5 bg-amber-50 rounded-lg ">
        <h2 className="text-2xl font-bold p-4 border-b border-gray-300">
          Users
        </h2>
        {typingUsers.map(({ user }) => (
          <p key={user.username}>{user.username} is typing...</p>
        ))}
        <ul className="p-4">
          {users.map((user, index) => (
            <li
              key={index}
              className={`p-2
                ${
                  user.username === username
                    ? "bg-green-500 text-white"
                    : "bg-gray-500 text-white"
                }
                rounded mb-2`}
            >
              {user.username}
            </li>
          ))}
        </ul>
      </aside>
      <section className="w-4/5 bg-white text-black rounded-lg  p-3 overflow-hidden">
        <Editor
          height="100%"
          loading={<p>Loading...</p>}
          defaultLanguage="javascript"
          defaultValue="// some comment"
          theme="light"
          onMount={handleMount}
        />
      </section>
    </main>
  );
}

export default App;